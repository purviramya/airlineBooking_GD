import { airport } from '../../shared/airports';
import { formatDay, formatDuration, formatTime, money } from '../context/AppContext';

// One selectable row per flight. `disabled` flights stay visible but cannot be picked.
export default function FlightList({ title, flights, selectedId, onSelect, disabled = () => false }) {
  return (
    <section>
      <h3>{title}</h3>
      {flights === null && <p className="muted">Loading flights…</p>}
      {flights?.length === 0 && <p className="muted">No flights with enough seats on that day. Try another date.</p>}
      {flights?.map((f) => {
        const off = disabled(f);
        const from = airport(f.origin);
        const to = airport(f.destination);
        return (
          <div key={f.id} className={`flight ${f.id === selectedId ? 'selected' : ''} ${off ? 'dim' : ''}`}>
            <div className="route">
              <div><div className="t">{formatTime(f.departsAt, from.tz)}</div><small>{f.origin}</small></div>
              <div className="line">{formatDuration(f.departsAt, f.arrivesAt)}</div>
              <div><div className="t">{formatTime(f.arrivesAt, to.tz)}</div><small>{f.destination}</small></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="price">{money(f.price)}</div>
              <button className="btn btn-sm" disabled={off} onClick={() => onSelect(f)}>{f.id === selectedId ? 'Selected' : 'Select'}</button>
            </div>
            <div className="meta">
              {f.flightNo} · {formatDay(f.departsAt, from.tz)}
              {f.seatsLeft <= 9 && <span className="low"> · only {f.seatsLeft} seat{f.seatsLeft === 1 ? '' : 's'} left</span>}
              {off && ' · departs before you land'}
            </div>
          </div>
        );
      })}
    </section>
  );
}
