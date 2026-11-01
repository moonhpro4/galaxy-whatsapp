const pin = document.getElementById('pin'), msg = document.getElementById('msg'), go = document.getElementById('go');
async function submit() {
  if (!pin.value) return;
  go.disabled = true;
  const r = await window.api.verifyPin(pin.value);
  go.disabled = false;
  if (r && r.ok) return;
  pin.value = ''; pin.focus();
  msg.textContent = r && r.wait ? `Too many attempts. Try again in ${r.wait}s.` : `Wrong PIN. ${r && r.left ? r.left + ' attempts left.' : ''}`;
}
go.addEventListener('click', submit);
pin.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
