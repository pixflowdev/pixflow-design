import { Slider } from '@base-ui/react/slider';
import { useT } from '../i18n';

export function MediaQualitySlider({ value, onChange, disabled }: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const label = useT()('automations.filterQuality');
  return <Slider.Root className="direct-media-quality" data-slot="slider" min={1} max={100}
    value={value} onValueChange={onChange} disabled={disabled}>
    <div className="direct-media-quality-label">{label}<span>{value}%</span></div>
    <Slider.Control className="direct-media-quality-control">
      <Slider.Track className="direct-media-quality-track" data-slot="slider-track">
        <Slider.Indicator className="direct-media-quality-range" data-slot="slider-range" />
        <Slider.Thumb className="direct-media-quality-thumb" data-slot="slider-thumb"
          aria-label={label} aria-valuetext={value + '%'} />
      </Slider.Track>
    </Slider.Control>
  </Slider.Root>;
}
