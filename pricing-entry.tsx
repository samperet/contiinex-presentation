import React from 'react';
import {createRoot} from 'react-dom/client';
import RoiPage from './app/roi/RoiPage';
import './app/globals.css';
import './app/roi/roi.css';
createRoot(document.getElementById('root')!).render(<RoiPage/>);
