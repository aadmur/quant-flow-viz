import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// 只引教学页自己的样式：旧的 tokens/base 是「深色车间」那套，body 上有 overflow:hidden，
// 会把比视口高的教学页锁死滚不动（full_page 截图看不出来，真机上底部讲解区直接滚不到）。
import './styles/academy.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root 不存在');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
