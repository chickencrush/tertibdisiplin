/* Pengaturan endpoint Apps Script. */
window.TD_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw_8hZ8MTeXQtEWaIYGkr83m9H1icf56m_0g_Rv_PzP--OE-kqluosg_xtYxAR6kJk/exec'
};
(function () {
  const base = document.currentScript ? document.currentScript.src : location.href;
  function load() {
    if (!document.getElementById('sidebar') || document.getElementById('td-account-module')) return;
    const script = document.createElement('script');
    script.id = 'td-account-module';
    script.src = new URL('./akun-pribadi.js', base).href;
    script.onerror = () => console.error('Modul KPI pribadi dan profil gagal dimuat.');
    document.head.append(script);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
