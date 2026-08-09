# DJ Tech Repair System - Slices

This document tracks the development slices for the DJ Tech Repair System.

## Slice 1: Setup Full-Stack Architecture & Core Database Models
- Convert Vite project to a full-stack Express + Vite application.
- Set up SQLite database using `@libsql/client` and `drizzle-orm`.
- Define initial database schema (Customers, Devices).
- Create basic API endpoints for Customers and Devices.

## Slice 2: Job Cards, Diagnostics & Timeline
- Define database schema for Job Cards, Job Items (Labour/Parts), and Timeline Events.
- Build API routes to manage jobs and add events to the job timeline.

## Slice 3: Inventory, Purchases & Product Link Import
- Define database schema for Inventory (Parts) and Purchases.
- Create API endpoints for stock management.
- Implement an adapter-based crawler for online product links (with mock functionality).

## Slice 4: Quotes, Invoicing & Payments
- Define schema for Quotes, Invoices, and Payments.
- API endpoints for generating quotes, invoices, and tracking payments.
- Cost and Profit calculations logic.

## Slice 5: Dashboard, Search, Reporting & Settings
- Overview dashboard API to fetch open jobs, financials.
- Global search endpoint.
- Business settings storage.

## Slice 6: Frontend - Core UI & Customers/Devices
- Setup Tailwind, routing (`react-router-dom`), and common UI components.
- Customer management and Device management views.

## Slice 7: Frontend - Job Cards & Inventory
- Job workflow UI (kanban/list).
- Job detail page with Timeline.
- Inventory management and purchasing flow.

## Slice 8: Frontend - Quotes, Invoicing, Dashboard & Integration
- Dashboard visuals.
- Quote creation and approval flow.
- Invoicing and payments views.
- Integration of all parts.
