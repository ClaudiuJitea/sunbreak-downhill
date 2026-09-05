"""Original procedural trailer score and telemetry-synchronized sound design.

No samples, instruments, or external audio assets. Python standard library only.
The music uses additive oscillators; bicycle, weather and percussion use filtered
noise. The output is stereo PCM, ready for the encoder's final loudness pass.
"""
import array
import json
import math
import random
import sys
import wave

RATE = 44100
DURATION = 45
N = RATE * DURATION
TAU = math.tau
rng = random.Random(729)
left = array.array('f', [0]) * N
right = array.array('f', [0]) * N
report = json.load(open(sys.argv[1]))
FPS = report['fps']


def add(start, duration, voice, gain=1, pan=0):
    begin = round(start * RATE)
    count = min(round(duration * RATE), N - begin)
    gl, gr = math.sqrt((1 - pan) / 2) * gain, math.sqrt((1 + pan) / 2) * gain
    for j in range(max(0, count)):
        sample = voice(j / RATE, j / max(1, count))
        left[begin + j] += sample * gl
        right[begin + j] += sample * gr


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def note(start, midi, duration=.35, gain=.08, pan=0, pad=False):
    frequency = hz(midi)
    def voice(t, u):
        envelope = min(1, t / (.18 if pad else .009)) * (1 - u) ** (1.1 if pad else 2.4)
        tone = math.sin(TAU * frequency * t) + .26 * math.sin(TAU * frequency * 2 * t)
        tone += .13 * math.sin(TAU * frequency * 3.002 * t)
        return tone * envelope
    add(start, duration, voice, gain, pan)
    if not pad and start + .23 < DURATION:
        add(start + .23, duration, voice, gain * .19, -pan)


def hit(start, kind, gain=1):
    if kind == 'kick':
        add(start, .28, lambda t, u: (math.sin(TAU * (48 * t + 3.7 * (1 - math.exp(-t * 42)))) * math.exp(-t * 17) + .13 * (rng.random()*2-1) * math.exp(-t*190)), .48 * gain)
    elif kind == 'snare':
        add(start, .22, lambda t, u: ((rng.random() * 2 - 1) * .76 + math.sin(TAU * 190 * t) * .45) * math.exp(-t * 24), .36 * gain, -.08)
        add(start+.016, .10, lambda t, u:(rng.random()*2-1)*math.exp(-t*38),.09*gain,.35)
    elif kind == 'hat':
        add(start, .045, lambda t, u: ((rng.random() * 2 - 1)*.65+math.sin(TAU*8461*t)*.20) * math.exp(-t * 95), .10 * gain, .45)
    else:
        add(start, .55, lambda t, u: (math.sin(TAU * (39 * t + 1.8 * (1 - math.exp(-t * 20)))) + .32 * (rng.random() * 2 - 1)) * math.exp(-t * 10), .36 * gain)


# 174 BPM racing breakbeat. Detuned additive saws supply a moving bass texture;
# a sub oscillator carries the low end, with syncopated kicks and sharp snares.
def bass(start,midi,duration,gain=.16):
    frequency=hz(midi)
    def voice(t,u):
        envelope=min(1,t/.008)*min(1,(1-u)*12)
        harmonic=sum(math.sin(TAU*frequency*k*t+math.sin(t*9)*.12)/k for k in range(1,7))
        detuned=sum(math.sin(TAU*frequency*1.007*k*t)/k for k in range(1,5))
        sub=math.sin(TAU*frequency*.5*t)
        return envelope*(math.tanh((harmonic+detuned)*1.45)*.64+sub*.60)
    add(start,duration,voice,gain,-.10)


beat = 60 / 174
chords = [(42, [66, 69, 73]), (38, [62, 66, 69]), (45, [64, 69, 73]), (40, [64, 68, 71])]
for bar in range(33):
    start = bar * beat * 4
    if start >= 44:
        break
    root, chord = chords[bar % 4]
    for k, pitch in enumerate(chord):
        note(start, pitch - 12, beat * 4 + .15, .026, (k - 1) * .6, pad=True)
    bass(start,root,beat*1.3,.19)
    bass(start+beat*1.5,root+12,beat*.4,.14)
    bass(start+beat*2,root,beat*1.4,.19)
    bass(start+beat*3.5,root+7,beat*.4,.16)
    for sub in range(16):
        at = start + sub * beat / 4
        if at > 44:
            continue
        intensity = 1.15 if at>=32 else 1
        hit(at, 'hat', intensity*(.50 if sub%2 else .9))
        if sub in (0,6,10) or bar%2 and sub==15:
            hit(at,'kick',intensity)
        if sub in (4,12):
            hit(at,'snare',intensity)
        if sub in (7,11,15):
            hit(at,'snare',.16)
        if sub % 2 == 0:
            note(at,chord[[0,1,2,1,0,2,1,2][sub//2]]+12,beat*.75,.050*intensity,.45 if sub%4 else -.45)
    if bar%4==0:
        add(start,.8,lambda t,u:(rng.random()*2-1)*math.exp(-t*6),.10,.2)
    # Short fills lead into the large jumps and the final sprint without stopping.
    if bar%8==7:
        for fill in range(4):hit(start+beat*(3+fill*.25),'snare',.25+fill*.12)

# Engine-independent telemetry foley follows what is actually shown in each shot.
frames = report['frames']
filtered = 0.0
chain_phase = 0.0
for i in range(N):
    t = i / RATE
    f = frames[min(len(frames) - 1, int(t * FPS))]
    speed = min(1, f['player']['speed'] / 40)
    active = f['shot'] != 'winner'
    noise = rng.random() * 2 - 1
    filtered += .045 * (noise - filtered)
    wind = filtered * (.07 + speed * .31) if active else filtered * .022
    tire = noise * .030 * speed if active and not f['player']['airborne'] else 0
    rain = (noise - filtered) * .033 if f['shot'] == 'rain' else 0
    chain_phase += (12 + speed * 25) / RATE
    chain = .035 * math.exp(-(chain_phase % 1) * 85) * speed if active else 0
    braking=f.get('controls',{}).get('brake',False)
    skid=(noise*.075+math.sin(TAU*(1450+70*math.sin(t*11))*t)*.025) if braking and active else 0
    boosted=f.get('controls',{}).get('boost',False) and f['player']['boost']>.01
    boost_air=filtered*.14 if boosted else 0
    left[i] += wind + tire + rain + chain + skid + boost_air
    right[i] += wind * .91 - tire * .8 - rain * .7 + chain * .72 + skid*.8+boost_air

# Cut accents, airborne wind rises, and passing swishes follow the new fast edit.
for at in (0,2,8,10,14,19,22,26,32,36):
    add(at, .48, lambda t, u: (rng.random() * 2 - 1) * math.sin(math.pi * u) ** 2, .075, -.35 if int(at) % 2 else .35)
for at in (13.1,25.1,35.1):
    add(at,.9,lambda t,u:((rng.random()*2-1)*.4+math.sin(TAU*(190*t+410*t*t))*.25)*u*u,.16)
previous = None
last_hit = -10
for f in frames:
    p = f['player']
    video_time = f['frame'] / FPS
    if previous and previous['shot'] == f['shot']:
        old = previous['player']
        for rival,prior in zip(f['riders'][1:],previous['riders'][1:]):
            gap=rival['s']-p['s'];old_gap=prior['s']-old['s']
            if gap*old_gap<0:
                pan=-.7 if rival.get('lateral',-1)<0 else .7
                add(max(0,video_time-.13),.38,lambda t,u:(rng.random()*2-1)*math.sin(math.pi*u)**2,.13,pan)
        if old['airborne'] and not p['airborne'] and video_time - last_hit > .4:
            hit(video_time, 'impact', .7)
            last_hit = video_time
        if p['score'] > old['score']:
            for k, pitch in enumerate((78, 81, 85)):
                note(video_time + k * .07, pitch, .3, .10, (k - 1) * .3)
    previous = f

winning = next(f['frame'] / FPS for f in frames if f['shot'] == 'finish' and f['player']['finished'])
hit(winning, 'impact', 1.25)
for k, pitch in enumerate((73, 76, 78, 81, 85)):
    note(winning + k * .12, pitch, .9, .14, (k - 2) * .25)
for pitch in (42, 66, 69, 73, 78):
    note(44, pitch, .98, .095, 0, pad=True)

# Gentle stereo ambience from a short cross delay, then a soft limiter and fades.
delay = round(.073 * RATE)
peak = 0
pcm = array.array('h')
for i in range(N):
    fade = min(1, i / (RATE * .35), (N - i) / (RATE * .6))
    a = math.tanh((left[i] + (right[i - delay] * .08 if i >= delay else 0)) * 1.25) * fade
    b = math.tanh((right[i] + (left[i - delay] * .08 if i >= delay else 0)) * 1.25) * fade
    peak = max(peak, abs(a), abs(b))
    pcm.extend((round(a * 30000), round(b * 30000)))
with wave.open(sys.argv[2], 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(pcm.tobytes())
print(f'Original stereo score: {DURATION}s / {RATE}Hz / peak {peak:.3f}')
