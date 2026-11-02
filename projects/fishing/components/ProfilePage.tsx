'use client';

import { useState, type KeyboardEvent } from 'react';
import './ProfilePage.css';

export type ProfilePanelName = 'credits' | 'invite' | 'notifications' | 'settings' | 'edit-profile' | 'drafts' | 'media';
export type ProfileSection = 'works' | 'appearances' | 'likes';

export interface ProfilePageProps {
  liked: boolean;
  onOpenFeed: () => void;
  onOpenPanel: (name: ProfilePanelName, title?: string) => void;
  onManageAvatar: () => void;
}

export interface ProfileMedia {
  id: string;
  kind: 'drafts' | 'live' | 'sample';
  src: string;
  alt: string;
  count?: string;
}

const SAMPLE_MEDIA: readonly ProfileMedia[] = [
  { id: 'motorcycle', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图', count: '410' },
  { id: 'coffee', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图', count: '610' },
  { id: 'sofa', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图', count: '3130' },
  { id: 'conversation', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图', count: '374' },
  { id: 'street', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图' },
  { id: 'friends', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图' },
  { id: 'portrait', kind: 'sample', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图' },
];

const LIVE_MEDIA: ProfileMedia = { id: 'live-room', kind: 'live', src: '/feed-ui/feed-stage-clean.png', alt: '实时舞池', count: '0' };
const DRAFT_MEDIA: ProfileMedia = { id: 'drafts', kind: 'drafts', src: '/feed-ui/archive-placeholder.svg', alt: '归档占位图' };
const APPEARANCE_MEDIA = [SAMPLE_MEDIA[0], SAMPLE_MEDIA[3], SAMPLE_MEDIA[5], SAMPLE_MEDIA[2], SAMPLE_MEDIA[6], SAMPLE_MEDIA[4]];
const LIKED_SAMPLE_MEDIA = [SAMPLE_MEDIA[1], SAMPLE_MEDIA[2], SAMPLE_MEDIA[4], SAMPLE_MEDIA[6], SAMPLE_MEDIA[0], SAMPLE_MEDIA[5]];
const SECTIONS = [
  { id: 'works', label: '作品 161' },
  { id: 'appearances', label: '我的出镜' },
  { id: 'likes', label: '点赞' },
] as const;
const STATS = [
  { count: '1524', label: '粉丝' },
  { count: '524', label: '关注' },
  { count: '1423', label: '获赞' },
  { count: '1420', label: '跟拍' },
] as const;

// Reference photographs are demo media, while the live work follows the real
// locally saved like passed down by LiveFeed. No account data is fabricated.
export function getProfileMedia(section: ProfileSection, liked: boolean): readonly ProfileMedia[] {
  if (section === 'works') return [DRAFT_MEDIA, LIVE_MEDIA, ...SAMPLE_MEDIA];
  if (section === 'appearances') return APPEARANCE_MEDIA;
  return liked ? [LIVE_MEDIA, ...LIKED_SAMPLE_MEDIA] : LIKED_SAMPLE_MEDIA;
}

export default function ProfilePage({ liked, onOpenFeed, onOpenPanel, onManageAvatar }: ProfilePageProps) {
  const [section, setSection] = useState<ProfileSection>('works');
  const media = getProfileMedia(section, liked);

  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SECTIONS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + SECTIONS.length - 1) % SECTIONS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = SECTIONS.length - 1;
    else return;
    event.preventDefault();
    setSection(SECTIONS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return <section className="app-page profile-page" id="profile-page" aria-label="我的主页">
    <div className="profile-scroll" id="profile-scroll">
      <header className="profile-header">
        <button type="button" className="credit-pill" onClick={() => onOpenPanel('credits')} aria-label="积分 527，示例积分">
          {/* The approved artwork is served verbatim, without image optimization or cropping changes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/feed-ui/icons/spark.svg" alt="" /><span>527</span>
        </button>
        <button type="button" className="header-icon invite" onClick={() => onOpenPanel('invite')} aria-label="邀请好友">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/feed-ui/icons/invite.svg" alt="" />
        </button>
        <button type="button" className="header-icon bell" onClick={() => onOpenPanel('notifications')} aria-label="通知">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/feed-ui/icons/bell.svg" alt="" />
        </button>
        <button type="button" className="header-icon settings" onClick={() => onOpenPanel('settings')} aria-label="设置">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/feed-ui/icons/settings.svg" alt="" />
        </button>
      </header>

      <div className="profile-identity">
        <button type="button" className="profile-avatar" onClick={() => onOpenPanel('edit-profile')} aria-label="编辑资料">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/feed-ui/archive-placeholder.svg" alt="示例头像" />
          <span className="edit-badge"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 13-1 4 4-1 10-10a2.1 2.1 0 0 0-3-3L4 13Zm8-8 3 3M12 17h5" /></svg></span>
        </button>
        <h2>Demo 用户</h2>
      </div>

      <div className="profile-stats" aria-label="示例个人统计">
        {STATS.map(stat => <button key={stat.label} type="button" onClick={() => onOpenPanel('media', `${stat.label}列表`)} title="示例资料，未连接账号数据">
          <strong>{stat.count}</strong><span>{stat.label}</span>
        </button>)}
      </div>
      <p className="profile-bio"><span aria-hidden="true" />来和我一起蹦迪吧</p>
      <div className="profile-actions">
        <button type="button" onClick={onManageAvatar}>管理分身</button>
        <button type="button" className="invite-friends" onClick={() => onOpenPanel('invite')}>邀请好友</button>
      </div>

      <div className="profile-sections" role="tablist" aria-label="内容分类">
        {SECTIONS.map((item, index) => <button
          key={item.id}
          id={`profile-tab-${item.id}`}
          type="button"
          className={section === item.id ? 'selected' : undefined}
          role="tab"
          aria-selected={section === item.id}
          aria-controls="profile-media-grid"
          tabIndex={section === item.id ? 0 : -1}
          onClick={() => setSection(item.id)}
          onKeyDown={event => selectWithKeyboard(event, index)}
        >{item.label}</button>)}
      </div>

      <div className="media-grid" id="profile-media-grid" role="tabpanel" aria-labelledby={`profile-tab-${section}`}>
        {media.map(item => <button
          key={item.id}
          type="button"
          className={`media-tile${item.kind === 'drafts' ? ' draft-tile' : item.kind === 'live' ? ' live-tile' : ''}`}
          aria-label={item.kind === 'live' ? '进入实时舞池' : item.kind === 'drafts' ? '草稿箱，2 个示例草稿' : `预览示例作品：${item.alt}`}
          title={item.kind === 'sample' ? '示例素材，未连接账号内容' : undefined}
          onClick={() => item.kind === 'live' ? onOpenFeed() : item.kind === 'drafts' ? onOpenPanel('drafts') : onOpenPanel('media', item.alt)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={item.kind === 'live' ? 'live-stage-thumb' : undefined} src={item.src} alt={item.alt} />
          {item.kind === 'drafts' && <><span className="draft-label">草稿箱</span><span className="draft-count">2</span></>}
          {item.kind === 'live' && <span className="live-tag"><i aria-hidden="true" />实时</span>}
          {item.kind === 'sample' && section !== 'works' && <span className="sample-label">示例</span>}
          {item.count !== undefined && <span className="play-count" title="参考界面的示例播放量">{item.count}</span>}
        </button>)}
      </div>
    </div>
  </section>;
}
