import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelBooking, getBookings } from '../services/api';
import { formatWhen, money, useApp } from '../context/AppContext';
import { airport } from '../../shared/airports';

function Leg({ label, leg }) {
  return (
    <div className="leg">
      <strong>{label}</strong> · {leg.flightNo} · {leg.origin} → {leg.destination}
      <p className="muted" style={{ margin: '2px 0 0' }}>
        {formatWhen(leg.departsAt, airport(leg.origin).tz)} → {formatWhen(leg.arrivesAt, airport(leg.destination).tz)} (local times)
      </p>
    </div>
  );
}

export default function Bookings() {
  const { id } = useParams();
  const { showToast } = useApp();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { getBookings().then(setBookings).catch((e) => setError(e.message)); }, []);

  const onCancel = async (bookingId) => {
    try {
      const updated = await cancelBooking(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      showToast('Trip cancelled');
    } catch (err) {
      showToast(err.message);
    }
  };

  if (error) return <div className="container"><p className="error">{error}</p></div>;
  if (!bookings) return <div className="container"><p className="muted">Loading…</p></div>;

  const shown = id ? bookings.filter((b) => b.id === id) : bookings;
  return (
    <div className="container narrow">
      <h1>{id ? 'Your booking' : 'My trips'}</h1>
      {id && <Link to="/bookings" className="back">← All trips</Link>}
      {shown.length === 0 && (
        <div className="empty"><p className="muted">No trips yet.</p><Link to="/" className="btn btn-primary">Search flights</Link></div>
      )}
      {shown.map((b) => (
        <article key={b.id} className="panel booking">
          <div className="booking-head">
            <strong>Ref {b.id} · {b.return ? 'Return' : 'One-way'}</strong>
            <span className={`status ${b.status}`}>{b.status}</span>
          </div>
          <Leg label="Outbound" leg={b.outbound} />
          {b.return && <Leg label="Return" leg={b.return} />}
          <p className="muted">{b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}</p>
          <p><strong>{money(b.totals.total)}</strong></p>
          {b.status === 'confirmed' && new Date(b.outbound.departsAt) > new Date() && (
            <button className="btn btn-sm" onClick={() => onCancel(b.id)}>Cancel trip</button>
          )}
        </article>
      ))}
    </div>
  );
}
