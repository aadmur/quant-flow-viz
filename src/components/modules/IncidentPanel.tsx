import type { IncidentKind } from '../../core/types';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Card } from '../ui/Card';
import { Chip, Empty, Stat } from '../ui/Controls';

const INJECTABLE: { kind: IncidentKind; label: string; desc: string }[] = [
  { kind: 'link-down', label: '网关断线', desc: '委托通道中断 9 tick' },
  { kind: 'liquidity-dry', label: '流动性枯竭', desc: '可成交量降至 22%' },
  { kind: 'stale-quote', label: '行情过期', desc: '报价标记不可信' },
  { kind: 'order-reject', label: '交易所拒单', desc: '价格笼子校验失败' },
  { kind: 'risk-block', label: '风控拦截', desc: '敞口/速率超限' },
];

const SEVERITY_TEXT = { info: '提示', warn: '告警', error: '严重' } as const;

export function IncidentPanel() {
  const snap = useSnap();
  const session = useSessionData();
  const openDetail = useSession((s) => s.openDetail);
  const injectIncident = useSession((s) => s.injectIncident);

  const log = session.incidents
    .filter((i) => i.tick <= snap.tick)
    .slice(-6)
    .reverse();

  const active = snap.activeIncidents;

  return (
    <Card
      phase="e3"
      span={12}
      active={snap.metrics.activePhase === 'e3'}
      pulsing={active.length > 0}
      onOpen={() => openDetail('e3')}
      right={
        active.length > 0 ? (
          <Chip kind="neg">{active.length} 个异常进行中</Chip>
        ) : (
          <Chip kind="down">链路正常</Chip>
        )
      }
      footer={
        <div className="row-between">
          <span>
            全链路共发生 <b className="num">{snap.incidents.filter((i) => i.tick <= snap.tick).length}</b> 次异常 ·
            每次都会改变下游行为（拒单 / 降速 / 降量），而不是只记一条日志
          </span>
          <span className="muted">点击任一异常类型可在当前 tick 注入</span>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="incident-actions">
            {INJECTABLE.map((i) => (
              <button
                key={i.kind}
                className="btn sm"
                style={{ justifyContent: 'flex-start', height: 30 }}
                onClick={() => injectIncident(i.kind)}
                title={`在 tick ${snap.tick} 注入：${i.desc}`}
              >
                <span style={{ textAlign: 'left' }}>
                  <span style={{ fontWeight: 650 }}>{i.label}</span>
                  <span className="tiny muted" style={{ display: 'block', lineHeight: 1.1 }}>
                    {i.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="stat-grid c3">
            <Stat
              label="进行中"
              value={active.length}
              small
              color={active.length > 0 ? 'var(--neg)' : 'var(--pos)'}
            />
            <Stat label="累计发生" value={snap.incidents.filter((i) => i.tick <= snap.tick).length} small />
            <Stat
              label="被拦截子单"
              value={snap.execution.blockedCount}
              small
              color={snap.execution.blockedCount > 0 ? 'var(--neg)' : undefined}
            />
          </div>

          {active.length > 0 && (
            <div className="banner warn">
              <b>{SEVERITY_TEXT[active[0].severity]}</b>
              <span>{active[0].message}</span>
            </div>
          )}
        </div>

        <div>
          <div className="tiny muted" style={{ marginBottom: 4 }}>
            异常事件流（含处置动作）
          </div>
          <div className="incident-list">
            {log.length === 0 ? (
              <Empty>暂未发生异常</Empty>
            ) : (
              log.map((i) => (
                <div
                  key={i.id}
                  className={`incident ${i.severity === 'error' ? 'active' : i.severity === 'warn' ? 'warn' : ''}`}
                >
                  <span className="incident-tick">T{i.tick}</span>
                  <div>
                    <div className="incident-msg">{i.message}</div>
                    <div className="incident-action">处置：{i.action}</div>
                  </div>
                  <span className="tiny muted">{SEVERITY_TEXT[i.severity]}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
