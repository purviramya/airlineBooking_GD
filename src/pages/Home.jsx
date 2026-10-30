import { useNavigate } from 'react-router-dom';
import SearchForm from '../components/SearchForm';
import { toQuery } from './Search';
import { APP, SCHEDULE } from '../../shared/config';

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="container">
      <section className="hero">
        <h1>{APP.emoji} Where to next?</h1>
        <p>Search flights up to {SCHEDULE.maxDaysAhead} days ahead. Add a return date for a round trip, or leave it empty for one-way.</p>
        <SearchForm onSearch={(f) => navigate(`/search?${toQuery(f)}`)} />
      </section>
    </div>
  );
}
