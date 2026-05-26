---
name: project-overview
description: High-level scope of the cleaning service product — three surfaces (mobile app, customer web, admin web), M-Pesa payments, Hawk Points loyalty
metadata:
  type: project
---

Project is a cleaning service platform with three client surfaces sharing one backend:
1. Mobile app (customer-facing)
2. Customer website
3. Admin website (operator/back-office portal)

Key features visible in the design mockups (16 screens, in `mockups/`):
- Auth: Sign in, Create account
- Customer dashboard: Home, Service catalog
- Booking flow: Scope → Date & address → Confirmation
- Booking management: Book a clean, Calendar, My bookings, Before & after photos, Quote request
- Account: Profile, Hawk Points (loyalty), Payment & receipts, M-Pesa STK push

**Why:** Project is greenfield — only the `mockups/` folder and an initial commit exist. The user has the visual designs and now needs to scaffold the system.

**How to apply:** When suggesting architecture or stack, remember three frontends share one backend. M-Pesa STK push implies Kenya market (Daraja API). Loyalty system ("Hawk Points") is a first-class feature, not an add-on. Before/after photo capture is part of the booking lifecycle so image storage matters from day one.
