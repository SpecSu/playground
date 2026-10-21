(function(){
 function report(message){
  var root=document.getElementById('root');
  if(root&&!root.querySelector('.app')){root.textContent='绒绒农场启动遇到问题：'+message+'。请刷新重试。';root.style.cssText='padding:40px;font:16px system-ui;color:#50654a';}
  fetch('/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:String(message).slice(0,1000),path:location.pathname})}).catch(function(){});
 }
 window.addEventListener('error',function(e){report(e.message||'脚本或资源没有加载成功');});
 window.addEventListener('unhandledrejection',function(e){report(e.reason&&e.reason.message||String(e.reason));});
})();
