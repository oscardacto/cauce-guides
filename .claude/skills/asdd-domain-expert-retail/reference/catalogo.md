# Gestión de Catálogo — Retail / Ecommerce

## Conceptos clave

- **Taxonomía**: árbol de categorías jerárquico (Ropa > Mujer > Vestidos > Casual)
- **Atributos**: propiedades del producto, algunas por categoría (talla en ropa, memoria en electrónicos)
- **Variantes**: combinaciones de atributos que generan SKUs (S-Rojo, M-Azul)
- **Precios**: precio base, precio de lista, precio de venta, precios por volumen
- **Disponibilidad**: en stock, agotado, preventa, descontinuado

## Reglas del catálogo

- Un producto padre puede tener N variantes — cada variante es un SKU con stock independiente
- Los atributos de una categoría son heredados por sus subcategorías
- Un producto debe tener al menos una imagen y un precio válido para estar visible
- Las descripciones de producto son fuente de SEO — no truncar ni normalizar innecesariamente
- Los precios por volumen se aplican automáticamente al superar el umbral de cantidad
