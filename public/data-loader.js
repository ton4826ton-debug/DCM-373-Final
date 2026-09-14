// Loads curriculum.json and renders all static content sections.
// Keeping this separate from script.js (chat logic) keeps things easy to edit.

let CURRICULUM = null;

async function loadCurriculum() {
  const res = await fetch('/data/curriculum.json');
  CURRICULUM = await res.json();
  renderHighlights();
  renderCreditBars();
  renderYearPanel(1);
  renderMinorTracks();
  renderCareers();
  renderPLOs();
  renderFAQ();
  renderAdmission();
  renderContact();
}

function renderHighlights() {
  const el = document.getElementById('highlightsGrid');
  el.innerHTML = CURRICULUM.program.highlights.map((h, i) => `
    <div class="card">
      <h3>0${i + 1}</h3>
      <p>${h}</p>
    </div>
  `).join('');
}

function renderCreditBars() {
  const el = document.getElementById('creditBars');
  const total = CURRICULUM.structure.total_credits;
  el.innerHTML = CURRICULUM.structure.categories.map(c => `
    <div class="credit-bar-row">
      <div class="credit-bar-label">${c.name}</div>
      <div class="credit-bar-track"><div class="credit-bar-fill" style="width:${(c.credits / total * 100).toFixed(0)}%"></div></div>
      <div class="credit-bar-val">${c.credits} นก.</div>
    </div>
  `).join('');
}

function renderYearPanel(year) {
  const el = document.getElementById('yearPanel');
  const y = CURRICULUM.study_plan.years.find(x => x.year === year);
  if (!y) return;
  const semBlock = (label, sem) => `
    <div class="sem-block">
      <h4>${label} (${sem.credits} หน่วยกิต)</h4>
      <ul>${sem.courses.map(c => `<li>${c}</li>`).join('')}</ul>
    </div>
  `;
  el.innerHTML = semBlock('ภาคการศึกษาที่ 1', y.sem1) + semBlock('ภาคการศึกษาที่ 2', y.sem2);
}

function renderMinorTracks() {
  const el = document.getElementById('minorTracks');
  el.innerHTML = CURRICULUM.structure.minor_tracks.map(t => `
    <div class="card">
      <h3>${t.name}</h3>
      <p>${t.credits} หน่วยกิต</p>
      <p>${t.courses.join(' · ')}</p>
    </div>
  `).join('');
}

function renderCareers() {
  const el = document.getElementById('careersGrid');
  el.innerHTML = CURRICULUM.program.careers.map(c => `
    <div class="card">
      <h3>${c.title_th}</h3>
      <p><em>${c.title_en}</em></p>
      <p>${c.desc}</p>
    </div>
  `).join('');
}

function renderPLOs() {
  const el = document.getElementById('ploCols');
  const groups = [
    ['ด้านความรู้', CURRICULUM.plos.knowledge],
    ['ด้านทักษะ', CURRICULUM.plos.skills],
    ['ด้านจริยธรรม', CURRICULUM.plos.ethics],
    ['ด้านคุณลักษณะบุคคล', CURRICULUM.plos.character],
  ];
  el.innerHTML = groups.map(([label, items]) => `
    <div class="plo-col">
      <h4>${label}</h4>
      <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>
  `).join('');
}

function renderFAQ() {
  const el = document.getElementById('faqList');
  el.innerHTML = CURRICULUM.faq_seed.map((f, i) => `
    <div class="faq-item" id="faq-${i}">
      <div class="faq-q" onclick="document.getElementById('faq-${i}').classList.toggle('open')">
        <span>${f.q}</span><span>+</span>
      </div>
      <div class="faq-a"><p>${f.a}</p></div>
    </div>
  `).join('');
}

function renderAdmission() {
  const a = CURRICULUM.admission;
  const roundsHtml = (a.rounds || []).map(r => `
    <div class="card" style="text-align:left; grid-column:1 / -1;">
      <h3>${r.name}</h3>
      <p><strong>เกณฑ์ GPAX ขั้นต่ำ:</strong> ${r.gpax_min}</p>
      <p>${r.note}</p>
    </div>
  `).join('');
  const eduHtml = (a.education_accepted || []).map(e => `<li>${e}</li>`).join('');

  document.getElementById('admissionText').innerHTML = `
    <p>${a.qualifications}</p>
    <div class="grid grid-2" style="text-align:left; margin-top:8px;">
      <div class="card">
        <h3>วุฒิที่รับสมัคร</h3>
        <ul style="margin:0; padding-left:18px; color:var(--text-dim); font-size:.94rem;">${eduHtml}</ul>
      </div>
      <div class="card">
        <h3>แผนการเรียน</h3>
        <p>${a.study_plans_accepted}</p>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:0;">${roundsHtml}</div>
    <p class="disclaimer" style="text-align:left; border-top:none; padding-top:0; margin-top:20px;">${a.tuition_note}</p>
  `;
}

function renderContact() {
  const c = CURRICULUM.program.contact;
  document.getElementById('contactGrid').innerHTML = `
    <div class="card"><h3>ที่อยู่</h3><p>${c.address}</p></div>
    <div class="card"><h3>โทรศัพท์</h3><p>สาขาวิชา: ${c.phone_program}<br>สำนักวิชา: ${c.phone_general}</p></div>
    <div class="card"><h3>อีเมล / โซเชียล</h3><p>${c.email}<br>Facebook: ${c.facebook}<br>Instagram: ${c.instagram}</p></div>
    <div class="card"><h3>สมัครเรียน</h3><p>${c.apply_url}</p></div>
  `;
}

document.getElementById('yearTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('#yearTabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderYearPanel(Number(btn.dataset.year));
});

loadCurriculum();
