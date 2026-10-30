import { Link, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Toast from './components/Toast';
import Home from './pages/Home';
import Search from './pages/Search';
import Bookings from './pages/Bookings';
import AuthPage from './pages/AuthPage';
import RequireAuth from './components/RequireAuth';
import { APP } from '../shared/config';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
          <Route path="/bookings/:id" element={<RequireAuth><Bookings /></RequireAuth>} />
          <Route path="*" element={<div className="container empty"><h2>Page not found</h2><Link to="/" className="btn">Go home</Link></div>} />
        </Routes>
      </main>
      <footer className="footer">© {new Date().getFullYear()} {APP.name}</footer>
      <Toast />
    </>
  );
}
