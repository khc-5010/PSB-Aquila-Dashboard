# PSB-Aquila Opportunity Tracker

A Kanban-style pipeline management tool for tracking university-industry partnership opportunities between Penn State Behrend and Aquila. Built for a small team (Kyle, Duane, Steve) to manage opportunities from initial lead through active project, with automated stakeholder alerts and deadline awareness for critical dates like the August 15 Senior Design deadline.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Neon account (for PostgreSQL database)
- Vercel account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/PSB-Aquila-Dashboard.git
cd PSB-Aquila-Dashboard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Database Setup

```bash
# Push schema to Neon (using Prisma)
npx prisma db push

# Seed initial data (if available)
npm run db:seed
```

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool & dev server |
| Tailwind CSS | 3.x | Styling |
| Neon | - | PostgreSQL database |
| Vercel | - | Hosting & deployment |

## Project Structure

```
PSB-Aquila-Dashboard/
├── src/
│   ├── components/
│   │   ├── ui/              # Reusable UI components
│   │   ├── pipeline/        # Kanban board components
│   │   ├── opportunities/   # Opportunity detail components
│   │   └── layout/          # Layout components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Database, API, utilities
│   ├── pages/               # Route components
│   ├── context/             # React context providers
│   ├── constants/           # Configuration & mappings
│   ├── App.jsx
│   └── main.jsx
├── public/                  # Static assets
├── api/                     # Serverless functions (Vercel)
├── CLAUDE.md                # AI assistant context
├── README.md
├── package.json
├── vite.config.js
├── tailwind.config.js
└── .env.example
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Optional: API configuration
VITE_API_URL="https://your-api-url.vercel.app"
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |

**Optional variables:**

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | API base URL (defaults to same origin) |

## Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main

**Manual deployment:**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy preview
vercel

# Deploy production
vercel --prod
```

### Environment Setup in Vercel

Add these environment variables in your Vercel project settings:

- `DATABASE_URL` - Your Neon connection string

## Contributing

This is a small team project. Keep it simple:

1. Create a feature branch from `main`
2. Make your changes
3. Test locally with `npm run dev`
4. Create a pull request
5. Merge after review

### Code Style

- Use functional components with hooks
- Style with Tailwind CSS only (no separate CSS files)
- Keep components focused and under 100 lines when possible
- Use meaningful commit messages

## License

Private - Penn State Behrend / Aquila
