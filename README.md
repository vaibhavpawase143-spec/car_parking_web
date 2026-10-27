# Bizflow Car Parking System - Web Application

A modern, high-performance web application for the **Jay Ganesh Pay & Park** car parking management system. Built with React, Vite, TypeScript, and Tailwind CSS, interfacing directly with the existing Google Cloud Firebase backend.

## 🏗 Architecture Overview

This web application operates as a dedicated counterpart to the existing Flutter mobile application:

- **Web Application (`D:\car_parking_web`):** Desktop and counter-first terminal for Admin operations, shift oversight, reporting, financial audits, and gate counter operations.
- **Mobile Application (`D:\car_parking_system`):** Preserved Flutter mobile application for handheld guard devices with Bluetooth SPP thermal printing.
- **Shared Backend:** Google Cloud Firestore project `car-parking-system-2026` with 14 shared collections, server-authoritative shift automation daemon (`auto_shift_daemon.py`), and atomic transaction safety.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ (verified with v24)
- npm or pnpm

### 2. Environment Configuration
Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Configure your Firebase Web App credentials (available in the Firebase Console under Project Settings -> General -> Your apps -> Web app):

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=car-parking-system-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=car-parking-system-2026
VITE_FIREBASE_STORAGE_BUCKET=car-parking-system-2026.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
```

> **Security Note:** Never commit `.env` or embed private service-account credentials in browser client code.

### 3. Development
Run the local development server:

```bash
npm run dev
```

### 4. Production Build & Typecheck
Perform static type checking and build the production bundle:

```bash
npm run type-check
npm run build
```

## 📂 Project Structure

```
D:\car_parking_web\
├── public\                  # Static assets and icons
├── src\
│   ├── app\                 # High-level application views & Landing Page
│   ├── assets\              # SVGs, images, and branding assets
│   ├── components\
│   │   ├── common\          # Badges, Buttons, Cards, UI primitives
│   │   ├── layout\          # Header, Footer, and responsive wrappers
│   │   ├── receipts\        # 58mm HTML/CSS thermal receipt print engine
│   │   └── ui\              # Shared input elements & modals
│   ├── config\              # Environment parsing and runtime feature flags
│   ├── features\
│   │   ├── auth\            # Authentication forms & session guards
│   │   ├── admin\           # Admin portal (Dashboard, Guards, Shifts, Ledger, Reports)
│   │   └── guard\           # Guard terminal (Entry, Exit, Active, Handover)
│   ├── firebase\            # Firebase client SDK initialization & instances
│   ├── hooks\               # Custom React hooks (real-time listeners, shift timers)
│   ├── services\            # Firestore business services
│   ├── types\               # TypeScript domain interfaces matching Dart models
│   ├── utils\               # Formatters, rate calculation engines, i18n
│   ├── App.tsx              # Root component & route dispatcher
│   ├── main.tsx             # DOM entrypoint
│   └── index.css            # Tailwind directives & print styling
├── .env.example             # Safe environment variable template
├── .gitignore               # Standard exclusion list
├── index.html               # HTML5 shell
├── package.json             # Pinned dependencies & scripts
├── tsconfig.json            # Strict TypeScript configuration
└── vite.config.ts           # Vite build configuration
```

## 🖨️ Thermal Printing Strategy (58 mm)

Web browsers do not support Android-style Classic Bluetooth SPP (Serial Port Profile). Thermal printing in the web application is handled via:
1. Standard browser print dialog (`window.print()`) with dedicated 58 mm `@media print` CSS rules.
2. Direct USB printing using the Web Serial / WebUSB API for tethered desktop counter setups (evaluated in future phases).

## 📋 Implementation Roadmap

- [x] **Phase 1:** Clean Project Foundation, TypeScript Setup, Tailwind CSS, Firebase Web SDK Configuration Module, Initial Application Shell.
- [ ] **Phase 2:** Authentication & Session Management (Admin & Guard login, AuthGate).
- [ ] **Phase 3:** Admin Portal (Live Capacity Gauges, Guard Management, Shift Scheduling, Reports Hub, Monthly Passes).
- [ ] **Phase 4:** Guard Portal & Operations (Vehicle Entry, Exit Calculation, Handover Reconciliation, 58mm Receipts).
- [ ] **Phase 5:** Concurrency Testing & Final End-to-End Validation.
