// The categories every new workspace starts with: general, two levels deep, in Mexican Spanish.
// Who was paid (Telmex, ChatGPT) is a payee, never a category.
import type { Sql } from "./common.ts";

type Kind = "income" | "expense";

const DEFAULT_CATEGORIES: readonly (readonly [Kind, string, readonly string[]])[] = [
  ["expense", "Comida y bebidas", ["Bar, café", "Supermercado", "Restaurante, comida rápida"]],
  ["expense", "Compras", [
    "Ropa y calzado",
    "Farmacia",
    "Electrónica, accesorios",
    "Tiempo libre",
    "Regalos",
    "Salud y belleza",
    "Hogar, jardín",
    "Joyería, accesorios",
    "Niños",
    "Mascotas",
    "Papelería, herramientas",
  ]],
  ["expense", "Vivienda", [
    "Luz, agua, gas",
    "Mantenimiento, reparaciones",
    "Hipoteca",
    "Seguro de vivienda",
    "Renta",
    "Servicios",
  ]],
  ["expense", "Transporte", [
    "Viajes de negocios",
    "Larga distancia",
    "Transporte público",
    "Taxi",
  ]],
  ["expense", "Vehículos", [
    "Combustible",
    "Arrendamiento",
    "Estacionamiento",
    "Renta de vehículos",
    "Seguro de vehículo",
    "Mantenimiento de vehículo",
  ]],
  ["expense", "Vida y entretenimiento", [
    "Deporte, fitness",
    "Alcohol, tabaco",
    "Libros, audio, suscripciones",
    "Donaciones",
    "Cultura, eventos deportivos",
    "Educación, desarrollo",
    "Salud, médico",
    "Pasatiempos",
    "Vacaciones, viajes, hoteles",
    "Eventos de la vida",
    "Lotería, apuestas",
    "TV, streaming",
    "Bienestar, belleza",
  ]],
  ["expense", "Comunicaciones, PC", [
    "Internet",
    "Teléfono, celular",
    "Servicios postales",
    "Software, apps, juegos",
    "Suscripciones",
  ]],
  ["expense", "Gastos financieros", [
    "Asesoría",
    "Cargos, comisiones",
    "Pensión alimenticia",
    "Multas",
    "Seguros",
    "Préstamos, intereses",
    "Impuestos",
  ]],
  ["expense", "Inversiones", [
    "Colecciones",
    "Inversiones financieras",
    "Bienes raíces",
    "Ahorros",
    "Vehículos, bienes muebles",
  ]],
  ["expense", "Otros", []],
  ["income", "Ingresos", [
    "Cheques, cupones",
    "Pensión alimenticia",
    "Cuotas y subvenciones",
    "Regalos",
    "Intereses, dividendos",
    "Préstamos, rentas",
    "Lotería, apuestas",
    "Reembolsos",
    "Ingresos por renta",
    "Ventas",
    "Salario, facturas",
  ]],
];

/** Gives a new, empty workspace the default categories. */
export async function seedDefaultCategories(sql: Sql, workspaceId: string): Promise<void> {
  const parents = await sql<{ id: string; name: string; kind: Kind }[]>`
    INSERT INTO finance.categories ${
    sql(DEFAULT_CATEGORIES.map(([kind, name]) => ({ workspace_id: workspaceId, name, kind })))
  } RETURNING id, name, kind`;
  const parentId = new Map(parents.map((parent) => [`${parent.kind}:${parent.name}`, parent.id]));
  const children = DEFAULT_CATEGORIES.flatMap(([kind, parent, names]) =>
    names.map((name) => ({
      workspace_id: workspaceId,
      name,
      kind,
      parent_id: parentId.get(`${kind}:${parent}`)!,
    }))
  );
  await sql`INSERT INTO finance.categories ${sql(children)}`;
}
