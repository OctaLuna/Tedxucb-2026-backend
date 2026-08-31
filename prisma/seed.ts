// Las semillas reales las añade cada módulo de negocio a medida que existan
// modelos que sembrar (ver prisma/schema.prisma). Vacío por ahora.
async function main() {}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
