# Zaitoon — House of Shawarma & BBQ 🌯

A full-stack production restaurant website built for a real client. Features an online menu, order flow, admin dashboard with order tracking, and revenue analytics — deployed live at [zaitoonpk.com](https://zaitoonpk.com).

![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)

---

## Live Demo

🌐 [zaitoonpk.com](https://zaitoonpk.com)

---

## Features

- **Menu display** — full menu with categories, images, and pricing
- **Order flow** — customers can browse and place orders
- **Admin dashboard** — real-time order tracking and status management
- **Revenue analytics** — sales data visualized for the restaurant owner
- **Responsive design** — works across mobile and desktop

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, Supabase |
| Database | PostgreSQL (via Supabase) |
| Auth | Supabase Auth |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (for database and auth)

### Installation

```bash
# Clone the repo
git clone https://github.com/ajwazameer/zaitoon.git
cd zaitoon

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your Supabase URL and anon key
```

### Environment Variables

Create a `.env.local` file in the root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # Reusable UI components
└── lib/              # Supabase client and utilities
public/               # Static assets
```

---

## Team

Built as part of the Web Technologies course at COMSATS University Islamabad, Lahore Campus. Delivered to the real client and now catering customers in LAHORE.

| Name | GitHub |
|---|---|
| Ajwa Zameer | [@ajwazameer](https://github.com/ajwazameer) |
| Ayesha Noor | [@AyeshaNoor-web](https://github.com/AyeshaNoor-web) |

---

## Screenshots
<img width="1600" height="900" alt="zaitoon_01_hero" src="https://github.com/user-attachments/assets/5c285a57-8812-4e3f-acc8-55baae65dcbe" />
<img width="1600" height="1020" alt="zaitoon_02_web_screens" src="https://github.com/user-attachments/assets/19e31912-da7d-4b73-b367-6d23265babdd" />
<img width="1600" height="800" alt="zaitoon_03_mobile_screens" src="https://github.com/user-attachments/assets/ae07a70c-2bd7-45d1-b60c-c6a856c2c871" />
<img width="1600" height="1000" alt="zaitoon_04_admin_features" src="https://github.com/user-attachments/assets/bb601b0b-0b56-4a83-82f6-79c5430c1a3a" />


---

*Built with Next.js · Supabase · Tailwind CSS*
