export function createDivingUI() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.justifyContent = 'space-between';
  container.style.padding = '20px';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  container.style.zIndex = '1000';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div style="background: var(--card, #fff); padding: 16px; border-radius: 22px; box-shadow: var(--sh, 0 6px 18px rgba(120,80,40,.12)); color: var(--ink, #3a3330); border-bottom: 4px solid var(--edge, #efe2d1);">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; color: var(--pri, #ff7a8a);">神奇潜水 🐠</h1>
        <div style="font-size: 14px; color: var(--ink2, #7a6f65);">控制: W A S D 移动 | Space 浮出 | Shift 下潜</div>
      </div>
      
      <div style="background: var(--card, #fff); padding: 16px; border-radius: 22px; box-shadow: var(--sh, 0 6px 18px rgba(120,80,40,.12)); color: var(--ink, #3a3330); text-align: right; border-bottom: 4px solid var(--edge, #efe2d1);">
        <div style="font-size: 24px; font-weight: bold; color: var(--lemon-d, #e8b42c);" id="scoreDisplay">分数: 0</div>
        <div style="font-size: 14px; color: var(--ink2, #7a6f65);" id="statusDisplay">水面上</div>
      </div>
    </div>

    <div style="display: flex; justify-content: center; margin-bottom: 40px;">
      <div style="width: 50%; max-width: 400px; background: var(--bg2, #fff6ea); height: 24px; border-radius: 999px; overflow: hidden; border: 3px solid var(--card, #fff); box-shadow: var(--sh-s, 0 2px 8px rgba(120,80,40,.08)); position: relative;">
        <div id="oxygenBar" style="height: 100%; width: 100%; background: var(--sky, #6cc4ff); transition: width 0.1s linear, background-color 0.3s;"></div>
        <div id="oxygenText" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">O2: 100%</div>
      </div>
    </div>
    
    <div id="gameOverScreen" style="display: none; position: absolute; inset: 0; background: rgba(58,46,38,.8); pointer-events: auto; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
      <div style="background: var(--card, #fff); padding: 40px; border-radius: 22px; text-align: center; box-shadow: var(--sh-l); border-bottom: 6px solid var(--edge);">
        <h2 style="font-size: 32px; color: var(--pri, #ff7a8a); margin: 0 0 16px 0;">氧气耗尽！</h2>
        <p style="font-size: 17px; color: var(--ink, #3a3330); margin: 0 0 32px 0;" id="finalScore">你捕获了 0 条稀有鱼类。</p>
        <button id="retryBtn" style="background: var(--pri, #ff7a8a); color: #fff; border: none; padding: 12px 32px; border-radius: 999px; font-size: 17px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 0 var(--pri-d, #e65d70);">再试一次</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  return {
    update: (oxygen, score, isSurface) => {
      const p = Math.max(0, Math.min(100, oxygen));
      const bar = document.getElementById('oxygenBar');
      bar.style.width = p + '%';
      bar.style.background = p < 30 ? 'var(--red, #ff6b6b)' : 'var(--sky, #6cc4ff)';
      document.getElementById('oxygenText').innerText = `O2: ${Math.ceil(p)}%`;
      document.getElementById('scoreDisplay').innerText = `分数: ${score}`;
      document.getElementById('statusDisplay').innerText = isSurface ? '水面上' : '水下潜游';
    },
    showGameOver: (score, onRetry) => {
      document.getElementById('gameOverScreen').style.display = 'flex';
      document.getElementById('finalScore').innerText = `你捕获了 ${score / 10} 条稀有鱼类。`;
      document.getElementById('retryBtn').onclick = () => {
        document.getElementById('gameOverScreen').style.display = 'none';
        onRetry();
      };
    }
  };
}

