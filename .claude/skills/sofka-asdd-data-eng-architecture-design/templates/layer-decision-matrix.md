---
fecha: YYYY-MM-DD
actualizado: YYYY-MM-DD
estado: Borrador
generado_por: sofka-asdd-data-architect
patron: {Medallion / Star schema / Medallion + Star schema en Gold}
plataforma: {Azure + Databricks / AWS nativo}
---

# Matriz de Capas — {Nombre del cliente / Proyecto}

> **Nota de plataforma:**
> - **Azure + Databricks:** ingesta vía ADF, almacenamiento en ADLS Gen2, procesamiento en Azure Databricks, governance en Unity Catalog. Delta Lake es el formato nativo en todas las capas.
> - **AWS nativo:** ingesta vía AWS Glue, almacenamiento en S3, consulta vía Athena (ad-hoc / BI) o Redshift (DWH estructurado), governance en AWS Glue Data Catalog. Formato Parquet o Delta según la herramienta.
> Estas dos plataformas son materialmente distintas: los componentes de ingesta, almacenamiento y catálogo cambian. Elegir la variante correcta antes de completar la matriz.

---

## Variante Medallion

| Capa | Obligatoria | Propósito | Qué llega | Qué sale | Owner | SLA frescura | Formato | Retención | Ubicación |
|---|---|---|---|---|---|---|---|---|---|
| Landing | No | Archivos raw tal como llegan del origen | Archivos del sistema fuente (ADF drop en Azure / Glue job output en AWS, SFTP, API) | Mismo archivo, sin transformar | {equipo} | {inmediata} | Parquet/CSV/JSON en Volume (Azure) o S3 prefix (AWS) | {período} | Azure: {catalog}.{schema}/Volumes/{ruta} · AWS: s3://{bucket}/landing/ |
| Bronze | Sí | Delta del landing, append-only, sin transformar | Archivos de Landing o ingesta directa | Misma estructura que origen en Delta | {equipo} | {T+Xh} | Delta | {período} | {catalog}.bronze |
| Silver | Sí | Datos limpios, tipados y con contratos de schema | Bronze validado y deduplicado | Schema comprometido sin nulos críticos | {equipo} | {T+Xh} | Delta | {período} | {catalog}.silver |
| Gold | Sí | Agregado orientado a consumo analítico o de negocio | Silver transformado | Métricas y entidades de negocio listas para consumo | {equipo} | {T+Xh} | Delta | {período} | {catalog}.gold |

## Variante Star Schema

| Capa | Tipo | Ejemplo de tabla | Grain | Owner | Actualización | SCD | Ubicación |
|---|---|---|---|---|---|---|---|
| Staging | Temporal | stg_{entidad} | Una fila por registro origen | Ingeniería | {frecuencia} | N/A | {catalog}.staging |
| Dimensión | Maestro | dim_{entidad} | Una fila por entidad de negocio | Analytics | Según SCD elegido | {SCD Tipo 1/2/3} | {catalog}.dwh |
| Hecho | Transaccional | fact_{evento} | Una fila por evento medible | Analytics | {frecuencia} | N/A | {catalog}.dwh |

## Nota de combinación
Gold de Medallion puede implementarse como Star Schema — no son excluyentes. En ese caso, la capa Gold contiene tablas dim_ y fact_ sobre datos ya limpios y validados en Silver.

## Patrón de ingesta por fuente

| Fuente | Sistema origen | Método de ingesta | Frecuencia | Destino | Herramienta |
|---|---|---|---|---|---|
| {nombre fuente} | {sistema} | {Auto Loader / JDBC / API / Kafka / Manual} | {real-time/batch} | {Bronze o Landing} | Azure: ADF + Databricks SDP · AWS: Glue ETL / Kinesis |

## Schema hints de Bronze y Silver
Columnas donde el tipo inferido podría diferir del tipo de negocio esperado:

| Tabla | Columna | Tipo inferido | Tipo comprometido | Motivo del hint |
|---|---|---|---|---|
| {tabla_bronze} | {columna} | {string} | {date} | {fechas en formato no estándar} |
