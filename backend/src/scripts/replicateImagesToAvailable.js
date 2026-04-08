const mysql = require('mysql2/promise');
require('dotenv').config();

async function replicateImagesToAvailable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await connection.beginTransaction();

    const [sourceRows] = await connection.query(
      'SELECT image_url, image_url_2, image_url_3, image_url_4 FROM products WHERE id = 1'
    );

    if (!sourceRows.length || !sourceRows[0].image_url) {
      throw new Error('Produto base (id=1) sem imagens para replicar.');
    }

    const source = sourceRows[0];

    const [updateResult] = await connection.query(
      "UPDATE products SET image_url = ?, image_url_2 = ?, image_url_3 = ?, image_url_4 = ? WHERE active = TRUE AND (image_url IS NULL OR image_url = '' OR image_url = '/products/placeholder.jpg')",
      [source.image_url, source.image_url_2, source.image_url_3, source.image_url_4]
    );

    await connection.commit();

    console.log(`Imagens replicadas com sucesso. Produtos atualizados: ${updateResult.affectedRows}`);
  } catch (error) {
    await connection.rollback();
    console.error('Falha ao replicar imagens:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

replicateImagesToAvailable();
