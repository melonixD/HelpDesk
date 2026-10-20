(function(){
  const button=document.getElementById('seo-theme');
  let theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  try{const saved=localStorage.getItem('helpdesk-theme');if(saved){const parsed=JSON.parse(saved);if(['light','dark'].includes(parsed))theme=parsed;}}catch{}
  document.documentElement.dataset.theme=theme;
  button?.addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('helpdesk-theme',JSON.stringify(theme));}catch{}});
})();
