import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SearchForm from '../components/SearchForm';
import FlightList from '../components/FlightList';
import { authClient } from '../services/auth-client';
import { createBooking, searchFlights } from '../services/api';
import { load, save } from '../services/storage';
import { money, useApp } from '../context/AppContext';
import { airportLabel } from '../../shared/airports';
import { calcTotals } from '../../shared/pricing';
import { validateBookingDetails } from '../../shared/validation';
import { validateSearch } from '../../shared/trip';
import { addDays } from '../../shared/time';
import { SCHEDULE } from '../../shared/config';

export const toQuery = ({ from, to, depart, returnDate, passengers }) =>
  new URLSearchParams({ from, to, depart, ...(returnDate ? { return: returnDate } : {}), passengers }).toString();

const emptyPax = (n) => Array.from({ length: n }, () => ({ firstName: '', lastName: '' }));

// Search → pick outbound (→ pick return, if a return date is set) → passenger details.
// The return date lives in the URL, so it can be added or removed at any point
// before paying: the "Add a return date" control in the trip summary does exactly that.
export default function Search() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { data: session } = authClient.useSession();
  const { showToast } = useApp();

  const q = { from: params.get('from'), to: params.get('to'), depart: params.get('depart'), returnDate: params.get('return') ?? '', passengers: params.get('passengers') ?? '1' };
  const searchErrors = validateSearch(q);
  const valid = Object.keys(searchErrors).length === 0;
  const n = Number(q.passengers);

  const [outList, setOutList] = useState(null);
  const [retList, setRetList] = useState(null);
  const [out, setOut] = useState(null);
  const [ret, setRet] = useState(null);
  const [pax, setPax] = useState(emptyPax(n));
  const [contact, setContact] = useState({ email: '', phone: '', ...load('contact', {}) });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load2 = () => {
    if (!valid) return;
    setOutList(null);
    searchFlights({ from: q.from, to: q.to, date: q.depart, passengers: n }).then(setOutList).catch((e) => setServerError(e.message));
    setRetList(null);
    if (q.returnDate) searchFlights({ from: q.to, to: q.from, date: q.returnDate, passengers: n }).then(setRetList).catch((e) => setServerError(e.message));
  };
  const key = params.toString();
  useEffect(() => { setOut(null); setRet(null); setServerError(null); setPax(emptyPax(n)); load2(); }, [key]);
  useEffect(() => { if (session) setContact((c) => ({ ...c, email: c.email || session.user.email.replace(/^instagram-.*@users\.invalid$/, '') })); }, [session]);

  // A same-day return must leave after the outbound lands; the server enforces this too.
  const tooEarly = (f) => out && new Date(f.departsAt) <= new Date(out.arrivesAt);
  useEffect(() => { if (ret && tooEarly(ret)) setRet(null); }, [out]);

  const legPrices = useMemo(() => [out?.price ?? 0, ...(q.returnDate ? [ret?.price ?? 0] : [])], [out, ret, q.returnDate]);
  const totals = calcTotals({ legPrices, passengers: n });
  const ready = out && (!q.returnDate || ret);

  const setReturnDate = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('return', value); else next.delete('return');
    setParams(next);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validateBookingDetails({ passengers: pax, contact });
    setErrors(errs);
    if (Object.keys(errs).length || !ready) return;
    setSubmitting(true);
    setServerError(null);
    save('contact', { email: contact.email, phone: contact.phone });
    try {
      const booking = await createBooking({ outboundId: out.id, returnId: ret?.id ?? null, passengers: pax, contact });
      showToast('Booking confirmed');
      navigate(`/bookings/${booking.id}`);
    } catch (err) {
      setErrors(err.details ?? {});
      setServerError(err.message || 'Could not complete your booking. Please try again.');
      setSubmitting(false);
      if (err.status === 401) navigate('/signin', { state: { from: location.pathname + location.search } });
      if (err.status === 409) { setOut(null); setRet(null); load2(); }
    }
  };

  const setName = (i, k) => (e) => setPax(pax.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)));
  const paxField = (i, k, label) => (
    <label className={`field ${errors[`passengers.${i}.${k}`] ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input value={pax[i]?.[k] ?? ''} onChange={setName(i, k)} autoComplete={i === 0 ? (k === 'firstName' ? 'given-name' : 'family-name') : 'off'} />
      {errors[`passengers.${i}.${k}`] && <small className="error">{errors[`passengers.${i}.${k}`]}</small>}
    </label>
  );

  return (
    <div className="container">
      <section className="hero" style={{ padding: 16 }}>
        <SearchForm key={key} initial={valid ? q : undefined} submitLabel="Update"
          onSearch={(f) => setParams(toQuery(f))} />
      </section>

      {!valid && <p className="error">{Object.values(searchErrors)[0]}</p>}
      {valid && (
        <div className="cols">
          <div className="legs">
            <FlightList title={`Outbound · ${airportLabel(q.from)} → ${airportLabel(q.to)}`}
              flights={outList} selectedId={out?.id} onSelect={setOut} />
            {q.returnDate && (
              <FlightList title={`Return · ${airportLabel(q.to)} → ${airportLabel(q.from)}`}
                flights={retList} selectedId={ret?.id} onSelect={setRet} disabled={tooEarly} />
            )}
          </div>

          <form className="panel" onSubmit={onSubmit} noValidate>
            <h3>Your trip</h3>
            {[['Outbound', out], ...(q.returnDate ? [['Return', ret]] : [])].map(([label, f]) => (
              <div key={label} className="leg">
                <strong>{label}</strong>{' '}
                {f ? <>{f.flightNo} · {f.origin} → {f.destination} · {money(f.price)}</> : <span className="muted">choose a flight</span>}
              </div>
            ))}

            <div className="add-return">
              {q.returnDate ? (
                <button type="button" className="btn btn-sm" onClick={() => setReturnDate('')}>Remove return · make one-way</button>
              ) : (
                <label>
                  <span className="muted">Add a return date: </span>
                  <input type="date" min={q.depart} max={addDays(q.depart, SCHEDULE.maxDaysAhead)}
                    onChange={(e) => e.target.value && setReturnDate(e.target.value)} />
                </label>
              )}
            </div>

            {ready && (
              <>
                <div className="pax">
                  {pax.map((_, i) => (
                    <div key={i}>
                      <strong>Passenger {i + 1}</strong>
                      <div className="pax-row">{paxField(i, 'firstName', 'First name')}{paxField(i, 'lastName', 'Last name')}</div>
                    </div>
                  ))}
                  <label className={`field ${errors.email ? 'has-error' : ''}`}>
                    <span>Contact email</span>
                    <input type="email" value={contact.email} autoComplete="email" onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                    {errors.email && <small className="error">{errors.email}</small>}
                  </label>
                  <label className={`field ${errors.phone ? 'has-error' : ''}`}>
                    <span>Phone <span className="opt">(optional)</span></span>
                    <input type="tel" value={contact.phone} autoComplete="tel" onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                    {errors.phone && <small className="error">{errors.phone}</small>}
                  </label>
                </div>
                <div className="summary">
                  <div><span>{n} × {q.returnDate ? 'return' : 'one-way'} fare</span><span>{money(totals.subtotal)}</span></div>
                  {totals.tax > 0 && <div><span>Tax</span><span>{money(totals.tax)}</span></div>}
                  <div className="total"><span>Total</span><span>{money(totals.total)}</span></div>
                </div>
              </>
            )}

            {serverError && <p className="error" role="alert">{serverError}</p>}
            {!session ? (
              <Link to="/signin" state={{ from: location.pathname + location.search }} className="btn btn-primary btn-block">Sign in to book</Link>
            ) : (
              <button className="btn btn-primary btn-block" disabled={!ready || submitting}>
                {submitting ? 'Booking…' : ready ? `Book ${n} passenger${n === 1 ? '' : 's'}` : q.returnDate && out ? 'Choose a return flight' : 'Choose a flight'}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
