# 构建音效精灵表：真实采样（Sonniss GDC Bundle / Kenney CC0 / OpenGameArt）→ 单一 mp3 + 索引
# 用法：python3 tools/build_audio.py
import json, os, subprocess
import numpy as np, soundfile as sf

A = '/tmp/acand'
SR = 44100
# name: (file, offset 'onset' 或秒数, 时长, 增益dB)
CLIPS = {
  'step1': ('wav/br_step.wav', 'onset', 0.55, -4),
  'step2': ('wav/mm_bigstep.wav', 'onset', 0.7, -4),
  'step3': ('wav/dd_steps.wav', 'onset', 0.55, -4),
  'servo1': ('wav/mm_servo.wav', 'onset', 0.55, -9),
  'servo2': ('wav/ca_servo.wav', 'onset', 0.6, -10),
  'hydr': ('wav/jf_hydr.wav', 'onset', 0.7, -8),
  'steam': ('wav/ab_steam.wav', 'onset', 0.8, -8),
  'whoosh1': ('wav/rs_whoosh03.wav', 'onset', 0.5, -5),
  'whoosh2': ('wav/sr_whoosh02.wav', 'onset', 0.5, -5),
  'whooshH': ('wav/mw_whoosh29.wav', 'onset', 0.9, -4),
  'punch': ('raw/x_npunch.mp3', 'onset', 0.4, -2),
  'hitFast': ('wav/wk_fasthit.wav', 'onset', 0.55, -3),
  'hitM1': ('wav/mw_impt.wav', 'onset', 0.7, -2),
  'hitM2': ('wav/pp_iron.wav', 'onset', 0.6, -2),
  'hitM3': ('wav/pp_barrel.wav', 'onset', 0.6, -2),
  'hitM4': ('wav/ak_bulk01.wav', 'onset', 0.8, -2),
  'hitH1': ('wav/wk_bigmetal.wav', 'onset', 1.3, 0),
  'hitH2': ('wav/ak_rust20.wav', 'onset', 1.1, 0),
  'hitH3': ('wav/gaf_hammer.wav', 'onset', 1.2, 0),
  'hitCin': ('wav/bz_mci16.wav', 'onset', 1.4, 0),
  'block1': ('wav/jse_shield.wav', 'onset', 0.6, -3),
  'block2': ('wav/pp_spade.wav', 'onset', 0.5, -4),
  'sword1': ('wav/rw_sword.wav', 'onset', 0.7, -3),
  'sword2': ('wav/la_swordslide.wav', 'onset', 0.7, -4),
  'mg': ('raw/x_mg.mp3', 'onset', 0.9, -4),
  'smg': ('raw/x_smg.mp3', 'onset', 0.6, -5),
  'cannon1': ('raw/x_mk44.mp3', 'onset', 1.2, -1),
  'cannon2': ('raw/x_steamcannon.mp3', 'onset', 1.2, -1),
  'laser1': ('wav/gm_laser.wav', 'onset', 1.0, -3),
  'laser2': ('raw/x_laser3.mp3', 'onset', 1.0, -4),
  'elec': ('wav/gm_elec.wav', 'onset', 1.2, -3),
  'flame': ('wav/sw_flamer.wav', 'onset', 1.8, -3),
  'torch': ('wav/sr_torch.wav', 'onset', 1.4, -5),
  'chainsaw': ('raw/x_chainsaw.mp3', 3.0, 1.8, -5),
  'drill': ('wav/drl_heavy.wav', 'onset', 1.2, -3),
  'rocket': ('wav/sm_rocket.wav', 'onset', 1.0, -3),
  'rpg': ('wav/pp_rpg.wav', 'onset', 1.5, -2),
  'expS': ('wav/sm_gl_hit.wav', 'onset', 1.0, -2),
  'expM': ('wav/pp_mine.wav', 'onset', 1.6, -1),
  'expM2': ('wav/dd_exp15.wav', 'onset', 2.0, -1),
  'expL': ('wav/dd_car06.wav', 'onset', 2.6, 0),
  'expXL': ('wav/dd_nuke07.wav', 'onset', 3.2, 0),
  'debris1': ('wav/mw_debris.wav', 'onset', 1.4, -4),
  'debris2': ('wav/bz_deb55.wav', 'onset', 1.0, -4),
  'techdeb': ('wav/gt_techdeb.wav', 'onset', 1.0, -4),
  'cinhit': ('wav/mw_cinhit.wav', 'onset', 2.2, 0),
  'braam': ('wav/mw_braam.wav', 'onset', 2.6, -2),
  'boom': ('wav/bz_boom003.wav', 'onset', 2.0, 0),
  'sub': ('wav/fx_sub04.wav', 'onset', 1.5, -2),
  'riser': ('wav/la_riser.wav', 'onset', 2.0, -5),
  'rise': ('wav/bz_rise001.wav', 'onset', 1.5, -5),
  'thunder': ('wav/sr_thclap.wav', 'onset', 1.5, -3),
  'morph': ('wav/br_morph.wav', 'onset', 1.0, -4),
  'baydoor': ('wav/br_baydoor.wav', 'onset', 1.5, -4),
  'drum': ('wav/br_drum.wav', 'onset', 1.0, -2),
  'bell': ('raw/x_bell.mp3', 'onset', 1.8, -3),
  'cheer1': ('wav/gaf_cheer.wav', 'onset', 4.5, -6),
  'cheer2': ('wav/sr_cheer.wav', 'onset', 4.0, -6),
  'crowdCharge': ('raw/x_crowdcharge.mp3', 'onset', 3.0, -7),
  'boo': ('raw/x_boo.mp3', 'onset', 2.5, -7),
  'voKO': ('/tmp/vo/17._ko.wav', 'onset', 1.6, 0),
  'voKnockout': ('/tmp/vo/16._knockout.wav', 'onset', 1.8, 0),
  'voFight': ('/tmp/vo/kenney/Audio/fight.ogg', 'onset', 1.2, 0),
  'voReady': ('/tmp/vo/kenney/Audio/ready.ogg', 'onset', 1.0, 0),
  'voWinner': ('/tmp/vo/kenney/Audio/winner.ogg', 'onset', 1.2, 0),
  'voCombo': ('/tmp/vo/kenney/Audio/combo.ogg', 'onset', 1.0, -1),
  'voPrepare': ('/tmp/vo/kenney/Audio/prepare_yourself.ogg', 'onset', 1.6, 0),
}

def load(path):
    p = path if path.startswith('/') else os.path.join(A, path)
    x, sr = sf.read(p, always_2d=True)
    x = x.mean(1)
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return x

def hp30(x):  # 简单一阶高通 30Hz，去直流 / 次声
    a = np.exp(-2 * np.pi * 30 / SR)
    y = np.zeros_like(x); prev_x = 0.0; prev_y = 0.0
    # 向量化近似：差分 + 漏积分
    from scipy.signal import lfilter
    return lfilter([1, -1], [1, -a], x)

out = []; index = {}; t = 0.0
gap = np.zeros(int(0.12 * SR))
for name, (f, off, dur, gdb) in CLIPS.items():
    x = load(f)
    pk = np.max(np.abs(x)) + 1e-9
    if off == 'onset':
        i = int(np.argmax(np.abs(x) > pk * 0.06)); i = max(0, i - int(0.004 * SR))
    else:
        i = int(off * SR)
    seg = x[i:i + int(dur * SR)].copy()
    try: seg = hp30(seg)
    except Exception: pass
    n = len(seg)
    fi = min(int(0.003 * SR), n // 4); seg[:fi] *= np.linspace(0, 1, fi)
    fo = min(int(max(0.06, dur * 0.35) * SR), n // 2)
    seg[n - fo:] *= np.linspace(1, 0, fo) ** 1.6
    seg = seg / (np.max(np.abs(seg)) + 1e-9) * (10 ** ((-1.0 + gdb) / 20))
    index[name] = [round(t, 4), round(n / SR, 4)]
    out.append(seg); out.append(gap); t += (n + len(gap)) / SR

y = np.concatenate(out).astype(np.float32)
sf.write('/tmp/ugc_sfx.wav', y, SR)
os.makedirs('public/audio', exist_ok=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', '/tmp/ugc_sfx.wav', '-ac', '1', '-b:a', '96k', 'public/audio/sfx.mp3'], check=True)
# mp3 编码器前置约 1105 采样延迟（LAME），运行时偏移补偿
json.dump(index, open('src/audio/sprite.json', 'w'), indent=0)
print('sfx', round(t, 1), 's, clips', len(index))

# 配乐：Kevin MacLeod - Raving Energy（Techno，123 BPM）
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(A, 'km_Raving_Energy.mp3'), '-af', 'afade=t=in:d=1.5,volume=0.9', '-b:a', '96k', 'public/audio/bgm.mp3'], check=True)
print('done')
