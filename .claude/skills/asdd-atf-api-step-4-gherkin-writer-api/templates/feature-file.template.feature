# language: es
# encoding: utf-8

@{wi-id} @{tag-principal}
Feature: {Título del WI}

  Como {actor del sistema}
  Quiero {capacidad del WI}
  Para {propósito de negocio}

  Background:
    Dado {precondición compartida 1}
    Y {precondición compartida 2}

  @{tag-CP} @CP-NNN
  Scenario: {Título del CP}
    Dado {precondición específica si aplica}
    Cuando el cliente envía {METHOD} "{path}" con {descripción del body}
    Entonces el servicio responde {status}
    Y el body contiene {assertion 1}
    Y el body cumple el schema "{SchemaName}"

  @{tag-CP-outline} @CP-NNN @CP-MMM
  Scenario Outline: {Título del outline}
    Dado el sistema está disponible
    Cuando el cliente envía {METHOD} con {campo} <valor>
    Entonces el servicio responde <status>
    Y el body contiene <error>

    Examples:
      | valor       | status | error                |
      | {valor1}    | 200    | n/a                  |
      | {valor2}    | 400    | INVALID_FORMAT       |
