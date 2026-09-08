# Fitness Function — ArchUnit (Java/Spring Boot)

**Atributo:** Maintainability / Modularity
**Sistema:** Wallet Service (Spring Boot)
**Tipo:** Invariante arquitectónico ejecutable en CI

## Invariantes que validamos

1. Las capas no pueden saltearse: `controller → application → domain`. Nada puede saltar de `controller` directo a `repository`.
2. Los controllers no pueden importar implementaciones de repositorio.
3. El paquete `domain` no depende de Spring (puro POJO).
4. Solo el paquete `infrastructure` puede usar `@Component` de Spring fuera de los controllers.
5. Los DTOs están en `controller/dto`, las entities en `domain/model`. No se mezclan.

## Test ArchUnit

```java
package co.guide.wallet.architecture;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.*;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

@AnalyzeClasses(packages = "co.guide.wallet")
public class WalletArchitectureTest {

  @ArchTest
  static final ArchRule layered_architecture =
      layeredArchitecture()
          .consideringAllDependencies()
          .layer("Controller").definedBy("..controller..")
          .layer("Application").definedBy("..application..")
          .layer("Domain").definedBy("..domain..")
          .layer("Infrastructure").definedBy("..infrastructure..")
          .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
          .whereLayer("Application").mayOnlyBeAccessedByLayers("Controller")
          .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Infrastructure")
          .whereLayer("Infrastructure").mayOnlyBeAccessedByLayers("Application");

  @ArchTest
  static final ArchRule domain_has_no_spring =
      noClasses()
          .that().resideInAPackage("..domain..")
          .should().dependOnClassesThat().resideInAPackage("org.springframework..");

  @ArchTest
  static final ArchRule controllers_dont_use_repositories =
      noClasses()
          .that().resideInAPackage("..controller..")
          .should().dependOnClassesThat().resideInAPackage("..repository..");
}
```

## Integración en CI

`pom.xml`:
```xml
<dependency>
  <groupId>com.tngtech.archunit</groupId>
  <artifactId>archunit-junit5</artifactId>
  <version>1.3.0</version>
  <scope>test</scope>
</dependency>
```

GitHub Actions:
```yaml
- name: Architecture tests
  run: mvn test -Dtest=WalletArchitectureTest
```

Falla en CI si alguna regla se viola → PR no mergea.

## Mensaje de error útil

ArchUnit produce mensajes que apuntan a la clase y línea. Ejemplo:
```
co.guide.wallet.controller.WalletController accesses field
co.guide.wallet.repository.WalletJpaRepository.entityManager
in (WalletController.java:42)
```

Lectura: el dev sabe exactamente qué arreglar.

## Mantenimiento

- Revisar las reglas trimestralmente: ¿siguen siendo válidas con el sistema actual?
- Cuando se agrega un nuevo paquete top-level, agregar al test.
- Si una regla bloquea un cambio legítimo, NO suprimirla — discutir si la regla está mal o el cambio está mal.
