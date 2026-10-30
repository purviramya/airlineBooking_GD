import { useState } from 'react';
import { AIRPORTS, airportLabel } from '../../shared/airports';
import { validateSearch } from '../../shared/trip';
import { addDays, todayInZone } from '../../shared/time';
import { APP, SCHEDULE } from '../../shared/config';

// The return date is optional: leave it empty for a one-way trip.
export default function SearchForm({ initial, onSearch, submitLabel = 'Search flights' }) {
  const today = todayInZone(APP.timezone);
  const [f, setF] = useState({ from: 'LHR', to: 'JFK', depart: addDays(today, 14), returnDate: '', passengers: '1', ...initial });
  const [errors, setErrors] = useState({});
  const set = (e) => setF({ ...f, [e.target.name]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const errs = validateSearch(f);
    setErrors(errs);
    if (!Object.keys(errs).length) onSearch(f);
  };

  const select = (name, label) => (
    <label className={`field ${errors[name] ? 'has-error' : ''}`}>
      <span>{label}</span>
      <select name={name} value={f[name]} onChange={set}>
        {AIRPORTS.map((a) => <option key={a.code} value={a.code}>{airportLabel(a.code)}</option>)}
      </select>
      {errors[name] && <small className="error">{errors[name]}</small>}
    </label>
  );

  return (
    <form className="search" onSubmit={submit} noValidate>
      {select('from', 'From')}
      {select('to', 'To')}
      <label className={`field ${errors.depart ? 'has-error' : ''}`}>
        <span>Depart</span>
        <input type="date" name="depart" value={f.depart} min={today} max={addDays(today, SCHEDULE.maxDaysAhead)} onChange={set} />
        {errors.depart && <small className="error">{errors.depart}</small>}
      </label>
      <label className={`field ${errors.returnDate ? 'has-error' : ''}`}>
        <span>Return <span className="opt">(optional)</span></span>
        <input type="date" name="returnDate" value={f.returnDate} min={f.depart || today} max={addDays(today, SCHEDULE.maxDaysAhead)} onChange={set} />
        {errors.returnDate && <small className="error">{errors.returnDate}</small>}
      </label>
      <label className="field">
        <span>Passengers</span>
        <select name="passengers" value={f.passengers} onChange={set}>
          {Array.from({ length: SCHEDULE.maxPassengers }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
