import { z } from 'zod';

export const TaxonomyStatusSchema = z.enum(['active', 'inactive']);

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional()
  );

const updateNameAz = z
  .string({
    invalid_type_error: 'Azərbaycan adı mətn olmalıdır.',
  })
  .trim()
  .min(1, 'Azərbaycan adı boş ola bilməz.')
  .max(160, 'Azərbaycan adı 160 simvoldan çox ola bilməz.')
  .optional();

const updateNameEn = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .string({
      invalid_type_error: 'İngilis adı mətn olmalıdır.',
    })
    .max(160, 'İngilis adı 160 simvoldan çox ola bilməz.')
    .nullable()
    .optional()
);

const optionalUuid = (fieldLabel: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().uuid(`${fieldLabel} düzgün UUID formatında olmalıdır.`).optional()
  );

const updateStatus = z.preprocess(
  (value) => (typeof value === 'boolean' ? (value ? 'active' : 'inactive') : value),
  TaxonomyStatusSchema.optional()
);

const optionalBoolean = z.boolean({ invalid_type_error: 'Aktivlik dəyəri boolean olmalıdır.' }).optional();

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function statusFromActiveFlag(value: boolean | undefined): z.infer<typeof TaxonomyStatusSchema> | undefined {
  if (value === undefined) return undefined;
  return value ? 'active' : 'inactive';
}

export const DepartmentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const SubdepartmentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const PositionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const CreateDepartmentSchema = z
  .object({
    name_az: z.string().trim().min(2).max(160),
    name_en: optionalTrimmedString(160),
    status: TaxonomyStatusSchema.default('active'),
  })
  .strict();

export const UpdateDepartmentSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: updateNameAz,
    name_az: updateNameAz,
    nameEn: updateNameEn,
    name_en: updateNameEn,
    status: updateStatus,
    is_active: optionalBoolean,
    isActive: optionalBoolean,
  })
  .strict()
  .transform((input) => ({
    name_az: firstDefined(input.name_az, input.name),
    name_en: input.name_en !== undefined ? input.name_en : input.nameEn,
    status: firstDefined(input.status, statusFromActiveFlag(firstDefined(input.is_active, input.isActive))),
  }));

export const CreateSubdepartmentSchema = z
  .object({
    department_id: z.string().uuid(),
    name_az: z.string().trim().min(2).max(160),
    name_en: optionalTrimmedString(160),
    status: TaxonomyStatusSchema.default('active'),
  })
  .strict();

export const UpdateSubdepartmentSchema = z
  .object({
    id: z.string().uuid().optional(),
    departmentId: optionalUuid('Şöbə ID-si'),
    department_id: optionalUuid('Şöbə ID-si'),
    name: updateNameAz,
    name_az: updateNameAz,
    nameEn: updateNameEn,
    name_en: updateNameEn,
    status: updateStatus,
    is_active: optionalBoolean,
    isActive: optionalBoolean,
  })
  .strict()
  .transform((input) => ({
    department_id: firstDefined(input.department_id, input.departmentId),
    name_az: firstDefined(input.name_az, input.name),
    name_en: input.name_en !== undefined ? input.name_en : input.nameEn,
    status: firstDefined(input.status, statusFromActiveFlag(firstDefined(input.is_active, input.isActive))),
  }));

export const CreatePositionSchema = z
  .object({
    subdepartment_id: z.string().uuid(),
    name_az: z.string().trim().min(2).max(160),
    name_en: optionalTrimmedString(160),
    status: TaxonomyStatusSchema.default('active'),
  })
  .strict();

export const UpdatePositionSchema = z
  .object({
    id: z.string().uuid().optional(),
    subdepartmentId: optionalUuid('Departament ID-si'),
    subdepartment_id: optionalUuid('Departament ID-si'),
    name: updateNameAz,
    name_az: updateNameAz,
    nameEn: updateNameEn,
    name_en: updateNameEn,
    status: updateStatus,
    is_active: optionalBoolean,
    isActive: optionalBoolean,
  })
  .strict()
  .transform((input) => ({
    subdepartment_id: firstDefined(input.subdepartment_id, input.subdepartmentId),
    name_az: firstDefined(input.name_az, input.name),
    name_en: input.name_en !== undefined ? input.name_en : input.nameEn,
    status: firstDefined(input.status, statusFromActiveFlag(firstDefined(input.is_active, input.isActive))),
  }));

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
export type CreateSubdepartmentInput = z.infer<typeof CreateSubdepartmentSchema>;
export type UpdateSubdepartmentInput = z.infer<typeof UpdateSubdepartmentSchema>;
export type CreatePositionInput = z.infer<typeof CreatePositionSchema>;
export type UpdatePositionInput = z.infer<typeof UpdatePositionSchema>;
