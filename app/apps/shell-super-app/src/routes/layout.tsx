import { Outlet } from '@modern-js/plugin-tanstack/runtime';
import { Helmet } from '@modern-js/runtime/head';

import './ui-kit.css';
import './index.css';

const Layout = () => (
  <div data-app-id="shell-super-app">
    <Helmet htmlAttributes={{ class: 'light' }} />
    <Outlet />
  </div>
);

export default Layout;
