import React from 'react';
import {createRoot} from 'react-dom/client';
import PricingPage from './app/pricing';
import './app/globals.css';
import './app/pricing.css';
createRoot(document.getElementById('root')!).render(<PricingPage/>);
