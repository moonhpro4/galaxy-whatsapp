const $ = id => document.getElementById(id);
function say(el, text, ok) { el.textContent = text; el.className = 'msg' + (ok ? ' ok' : ''); }
async function refresh() {
  const s = await window.api.getState(); if (!s) return;
  $('ver').textContent = 'v' + s.version;
  $('startup').checked = s.startup;
  $('pinStatus').textContent = s.hasPin ? 'A PIN is set. The app asks for it on launch.' : 'No PIN set. The app opens straight away.';
  $('cur').style.display = $('remove').style.display = $('lockNow').style.display = s.hasPin ? '' : 'none';
  $('save').textContent = s.hasPin ? 'Change PIN' : 'Set PIN';
}
$('save').onclick = async () => {
  if ($('new').value !== $('new2').value) return say($('pinMsg'), 'PINs do not match');
  const r = await window.api.setPin($('new').value, $('cur').value);
  if (r.ok) { $('cur').value = $('new').value = $('new2').value = ''; say($('pinMsg'), 'PIN saved', true); refresh(); }
  else say($('pinMsg'), r.error);
};
$('remove').onclick = async () => {
  const r = await window.api.removePin($('cur').value);
  if (r.ok) { $('cur').value = ''; say($('pinMsg'), 'PIN removed', true); refresh(); } else say($('pinMsg'), r.error);
};
$('lockNow').onclick = () => window.api.lockNow();
$('startup').onchange = async e => {
  const on = await window.api.setStartup(e.target.checked);
  e.target.checked = on; say($('stMsg'), on ? 'Will launch at startup' : 'Startup disabled', true);
};
refresh();
