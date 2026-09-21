# Brick Master Dashboard

Build a complete, premium web application called "CDB Bricks Sales Management System". The UI must look like a professional business dashboard using React, Tailwind CSS, and shadcn/ui. 

- Font & Language: Use Google Font 'Hind Siliguri' as the default font to render beautiful Bengali text throughout the app.

- Layout: Create a sidebar navigation (which collapses into a touch-friendly mobile bottom/drawer navigation on small screens). The top header must include the user's name, role badge (Admin / Manager), a localStorage-backed Dark Mode toggle, and a logout button.

- Role-Based Dashboards: 

  1. Admin Dashboard: Show 8 summary cards: Today's Total Challans, Today's Total Bricks Delivered, Today's Total Sales Amount (৳), Today's Advance Deliveries, Pending Approvals (with a red badge alert if > 0), Approved Sales, Total Customers, and Total Lifetime Bricks Delivered.

  2. Manager Dashboard: Show 4 summary cards: My Entries Today, My Pending Entries, My Approved Entries, and Total Bricks Entered Today.

- Features: Add a Date Range Filter (From Date / To Date) at the top of the dashboard that dynamically updates all card stats. Below the cards, show a responsive table of the last 10 recent sales entries. Use loading skeletons while fetching data.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cdb-bricks-board.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/57bdcb50-1fe5-4e30-8035-0bce45d3b6ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
