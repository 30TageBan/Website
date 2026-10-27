import { prisma } from './client';

async function main() {
  // Seed: legt eine leere Portfolio-Konfiguration an, falls nicht vorhanden.
  const existing = await prisma.portfolio.findFirst();
  if (!existing) {
    await prisma.portfolio.create({
      data: {
        title: 'Chris',
        subtitle: 'Fullstack Developer',
        avatarUrl: '',
        bannerUrl: '',
        seoTitle: 'chris-g.dev',
        seoDescription: 'Portfolio von Chris.',
        seoOgImageUrl: '',
        backgroundPreset: 'default',
        backgroundSettings: {
          overlayOpacity: 0.55,
          blur: 18,
          vignette: 0.35,
        },
        spotifyTrackId: '',
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
