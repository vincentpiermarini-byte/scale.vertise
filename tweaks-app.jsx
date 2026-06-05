const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "weight": "Light",
  "size": 1,
  "tracking": -0.04,
  "subtitle": "We build it. We launch it. You grow. Or it's free.",
  "overlay": 0.25,
  "bg": "#050608"
}/*EDITMODE-END*/;

const WEIGHT_MAP = { Thin: 200, Light: 300, Regular: 400 };

function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--black', t.bg);
    r.style.setProperty('--ov', String(t.overlay));
    r.style.setProperty('--hl-weight', String(WEIGHT_MAP[t.weight] || 300));
    r.style.setProperty('--hl-scale', String(t.size));
    r.style.setProperty('--hl-tracking', t.tracking + 'em');

    const sub = document.querySelector('.hero .sub');
    if (sub) sub.textContent = t.subtitle;
  }, [t]);

  return (
    <TweaksPanel>
      <TweakSection label="Headline" />
      <TweakRadio label="Weight" value={t.weight}
        options={['Thin', 'Light', 'Regular']}
        onChange={(v) => setTweak('weight', v)} />
      <TweakSlider label="Size" value={t.size} min={0.7} max={1.3} step={0.05}
        onChange={(v) => setTweak('size', v)} />
      <TweakSlider label="Tracking" value={t.tracking} min={-0.06} max={0} step={0.005} unit="em"
        onChange={(v) => setTweak('tracking', v)} />

      <TweakSection label="Atmosphere" />
      <TweakSlider label="Video dim" value={t.overlay} min={0} max={0.7} step={0.05}
        onChange={(v) => setTweak('overlay', v)} />
      <TweakColor label="Background" value={t.bg}
        options={['#050608', '#0b0f17', '#0a0e1a', '#0d0b14']}
        onChange={(v) => setTweak('bg', v)} />

      <TweakSection label="Subtitle" />
      <TweakText label="Text" value={t.subtitle}
        onChange={(v) => setTweak('subtitle', v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<TweaksApp />);
