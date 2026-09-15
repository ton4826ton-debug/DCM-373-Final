// DCM Curriculum Chatbot server
// Serves the static website and exposes POST /api/chat which answers
// questions about the curriculum using retrieval-augmented generation:
// the whole curriculum.json is passed as context to an AI model, along
// with a system prompt instructing it to answer ONLY from that data.
//
// Works two ways:
//   1) With an API key set (GEMINI_API_KEY, ANTHROPIC_API_KEY, or
//      OPENAI_API_KEY) -> real AI-generated answers, grounded in
//      curriculum.json. Checked in that order.
//   2) Without any key -> falls back to simple keyword search over
//      curriculum.json + faq_seed, so the site still works for demos.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
app.use(express.json());

const ROOT = path.join(__dirname, '..');
const CURRICULUM_PATH = path.join(ROOT, 'data', 'curriculum.json');
const curriculum = JSON.parse(fs.readFileSync(CURRICULUM_PATH, 'utf8'));

app.use(express.static(path.join(ROOT, 'public')));
app.use('/data', express.static(path.join(ROOT, 'data')));

const SYSTEM_PROMPT = `คุณคือ "DCM Bot" ผู้ช่วยตอบคำถามเกี่ยวกับหลักสูตรสารสนเทศศาสตรบัณฑิต
สาขาดิจิทัลคอนเทนต์และสื่อ (DCM) มหาวิทยาลัยวลัยลักษณ์ เท่านั้น

กติกา:
- ตอบโดยอ้างอิงข้อมูลใน CURRICULUM_DATA ด้านล่างเท่านั้น ห้ามเดาหรือแต่งข้อมูลที่ไม่มีอยู่
- ถ้าคำถามไม่เกี่ยวกับหลักสูตรนี้ หรือไม่มีข้อมูลรองรับ ให้ตอบตามตรงว่าไม่มีข้อมูล และแนะนำให้ติดต่อสำนักวิชาสารสนเทศศาสตร์โดยตรง
- ตอบเป็นภาษาไทย กระชับ อ่านง่าย ใช้หัวข้อย่อยได้ถ้าจำเป็น
- ถ้าถามเรื่องค่าเทอม/ค่าธรรมเนียม ให้แนะนำให้ตรวจสอบที่เว็บไซต์ทางการหรือติดต่อสำนักวิชาโดยตรง เพราะอัตราอาจเปลี่ยนแปลงได้

CURRICULUM_DATA:
${JSON.stringify(curriculum)}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGemini(messages, attempt = 1, disableThinking = true) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const generationConfig = { maxOutputTokens: 2048 };
  if (disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 503 && attempt < 5) {
      await sleep(attempt * 1500);
      return callGemini(messages, attempt + 1, disableThinking);
    }
    if (res.status === 400 && disableThinking) {
      return callGemini(messages, attempt, false);
    }
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const answerParts = parts.filter(p => !p.thought);
  return answerParts.map(p => p.text || '').join('').trim();
}

async function callAnthropic(messages) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

async function callOpenAI(messages) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Very small fallback so the demo still works with zero API keys configured.
function fallbackAnswer(question) {
  const q = question.toLowerCase();
  const hit = curriculum.faq_seed.find(f => q.includes(f.q.slice(0, 6).toLowerCase()));
  if (hit) return hit.a;

  if (q.includes('กี่ปี') || q.includes('กี่หน่วยกิต')) {
    return `หลักสูตรนี้เป็นปริญญาตรี 4 ปี รวม ${curriculum.program.total_credits} หน่วยกิต ระบบทวิภาค`;
  }
  if (q.includes('อาชีพ') || q.includes('ทำงาน')) {
    const list = curriculum.program.careers.map(c => `- ${c.title_th} (${c.title_en})`).join('\n');
    return `อาชีพที่สามารถประกอบได้หลังสำเร็จการศึกษา:\n${list}`;
  }
  if (q.includes('วิชาโท')) {
    const list = curriculum.structure.minor_tracks.map(t => `- ${t.name} (${t.credits} หน่วยกิต)`).join('\n');
    return `หลักสูตรมีวิชาโทให้เลือก 4 กลุ่ม:\n${list}`;
  }
  if (q.includes('สหกิจ')) {
    return curriculum.faq_seed.find(f => f.q.includes('สหกิจศึกษา'))?.a
      || 'มีสหกิจศึกษารวมไม่น้อยกว่า 8 เดือน';
  }
  return `ขออภัยครับ ระบบยังไม่ได้เชื่อมต่อ AI API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY, ANTHROPIC_API_KEY หรือ OPENAI_API_KEY ใน .env)
ตอนนี้ตอบได้เฉพาะคำถามพื้นฐาน เช่น "เรียนกี่ปี", "จบแล้วทำงานอะไรได้บ้าง", "มีวิชาโทอะไรบ้าง", "มีสหกิจศึกษาไหม"
กรุณาติดต่อสำนักวิชาสารสนเทศศาสตร์ที่ ${curriculum.program.contact.email} สำหรับคำถามอื่น ๆ`;
}

app.post('/api/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    if (process.env.GEMINI_API_KEY) {
      const reply = await callGemini(messages);
      return res.json({ reply });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const reply = await callAnthropic(messages);
      return res.json({ reply });
    }
    if (process.env.OPENAI_API_KEY) {
      const reply = await callOpenAI(messages);
      return res.json({ reply });
    }
    return res.json({ reply: fallbackAnswer(lastUserMsg) });
  } catch (err) {
    console.error(err);
    // Even if the AI call fails (e.g. Google's servers are overloaded —
    // a transient 503), don't leave the widget dead: answer with the
    // keyword fallback and say briefly why, so a live demo keeps working.
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const note = 'ขณะนี้เชื่อมต่อ AI ไม่สำเร็จชั่วคราว (เซิร์ฟเวอร์ AI อาจมีคนใช้งานเยอะ) ขอตอบแบบพื้นฐานไปก่อนนะครับ:\n\n';
    res.json({ reply: note + fallbackAnswer(lastUserMsg) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DCM curriculum site running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log('No AI API key found — chatbot is running in fallback (rule-based) mode. See .env.example.');
  } else if (process.env.GEMINI_API_KEY) {
    console.log(`Using Gemini model: ${process.env.GEMINI_MODEL || 'gemini-flash-latest'}`);
  }
});
