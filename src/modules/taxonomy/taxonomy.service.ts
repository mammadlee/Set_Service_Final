import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  CreateDepartmentInput,
  CreatePositionInput,
  CreateSubdepartmentInput,
  UpdateDepartmentInput,
  UpdatePositionInput,
  UpdateSubdepartmentInput,
} from './taxonomy.schema';

const taxonomyInclude = {
  subdepartments: {
    orderBy: { name_az: 'asc' },
    include: {
      positions: {
        orderBy: { name_az: 'asc' },
      },
    },
  },
} satisfies Prisma.DepartmentInclude;

type ActivePositionRecord = Prisma.PositionGetPayload<{
  include: {
    subdepartment: {
      include: {
        department: true;
      };
    };
  };
}>;

export type TaxonomyPositionSummary = {
  id: string;
  slug: string;
  name_az: string;
  name_en: string | null;
  status: string;
  subdepartment_id: string;
  department_id: string;
  subdepartment: {
    id: string;
    slug: string;
    name_az: string;
    name_en: string | null;
    status: string;
  };
  department: {
    id: string;
    slug: string;
    name_az: string;
    name_en: string | null;
    status: string;
  };
};

export async function listTaxonomy(options: { includeInactive?: boolean } = {}) {
  const includeInactive = options.includeInactive === true;
  const departments = await prisma.department.findMany({
    where: includeInactive ? {} : { status: 'active' },
    include: {
      subdepartments: {
        where: includeInactive ? {} : { status: 'active' },
        orderBy: { name_az: 'asc' },
        include: {
          positions: {
            where: includeInactive ? {} : { status: 'active' },
            orderBy: { name_az: 'asc' },
          },
        },
      },
    },
    orderBy: { name_az: 'asc' },
  });

  return { data: departments };
}

export async function listPositions(options: { includeInactive?: boolean } = {}) {
  const includeInactive = options.includeInactive === true;
  const positions = await prisma.position.findMany({
    where: includeInactive ? {} : { status: 'active', subdepartment: { status: 'active', department: { status: 'active' } } },
    include: {
      subdepartment: {
        include: {
          department: true,
        },
      },
    },
    orderBy: { name_az: 'asc' },
  }) as ActivePositionRecord[];

  return {
    data: positions.map((position): TaxonomyPositionSummary => ({
      id: position.id,
      slug: position.slug,
      name_az: position.name_az,
      name_en: position.name_en,
      status: position.status,
      subdepartment_id: position.subdepartment_id,
      department_id: position.subdepartment.department_id,
      subdepartment: {
        id: position.subdepartment.id,
        slug: position.subdepartment.slug,
        name_az: position.subdepartment.name_az,
        name_en: position.subdepartment.name_en,
        status: position.subdepartment.status,
      },
      department: {
        id: position.subdepartment.department.id,
        slug: position.subdepartment.department.slug,
        name_az: position.subdepartment.department.name_az,
        name_en: position.subdepartment.department.name_en,
        status: position.subdepartment.department.status,
      },
    })),
  };
}

export async function findActivePositionsByIds(positionIds: string[]): Promise<ActivePositionRecord[]> {
  const uniqueIds = [...new Set(positionIds)];
  if (uniqueIds.length === 0) return [];

  return prisma.position.findMany({
    where: {
      id: { in: uniqueIds },
      status: 'active',
      subdepartment: {
        status: 'active',
        department: { status: 'active' },
      },
    },
    include: {
      subdepartment: {
        include: {
          department: true,
        },
      },
    },
  }) as Promise<ActivePositionRecord[]>;
}

export async function createDepartment(input: CreateDepartmentInput) {
  try {
    return await prisma.department.create({
      data: {
        slug: await uniqueSlug('department', input.name_en ?? input.name_az),
        name_az: input.name_az,
        name_en: input.name_en,
        status: input.status,
      },
      include: taxonomyInclude,
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  try {
    return await prisma.department.update({
      where: { id },
      data: {
        ...(input.name_az !== undefined ? { name_az: input.name_az } : {}),
        ...(input.name_en !== undefined ? { name_en: input.name_en?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: taxonomyInclude,
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

export async function createSubdepartment(input: CreateSubdepartmentInput) {
  await ensureDepartmentExists(input.department_id);
  try {
    return await prisma.subdepartment.create({
      data: {
        department_id: input.department_id,
        slug: await uniqueSlug('subdepartment', input.name_en ?? input.name_az),
        name_az: input.name_az,
        name_en: input.name_en,
        status: input.status,
      },
      include: { positions: true, department: true },
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

export async function updateSubdepartment(id: string, input: UpdateSubdepartmentInput) {
  if (input.department_id) await ensureDepartmentExists(input.department_id);
  try {
    return await prisma.subdepartment.update({
      where: { id },
      data: {
        ...(input.department_id !== undefined ? { department_id: input.department_id } : {}),
        ...(input.name_az !== undefined ? { name_az: input.name_az } : {}),
        ...(input.name_en !== undefined ? { name_en: input.name_en?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: { positions: true, department: true },
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

export async function createPosition(input: CreatePositionInput) {
  await ensureSubdepartmentExists(input.subdepartment_id);
  try {
    return await prisma.position.create({
      data: {
        subdepartment_id: input.subdepartment_id,
        slug: await uniqueSlug('position', input.name_en ?? input.name_az),
        name_az: input.name_az,
        name_en: input.name_en,
        status: input.status,
      },
      include: { subdepartment: { include: { department: true } } },
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

export async function updatePosition(id: string, input: UpdatePositionInput) {
  if (input.subdepartment_id) await ensureSubdepartmentExists(input.subdepartment_id);
  try {
    return await prisma.position.update({
      where: { id },
      data: {
        ...(input.subdepartment_id !== undefined ? { subdepartment_id: input.subdepartment_id } : {}),
        ...(input.name_az !== undefined ? { name_az: input.name_az } : {}),
        ...(input.name_en !== undefined ? { name_en: input.name_en?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: { subdepartment: { include: { department: true } } },
    });
  } catch (error) {
    throw mapTaxonomyWriteError(error);
  }
}

async function ensureDepartmentExists(id: string) {
  const department = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!department) throw Errors.notFound('Şöbə tapılmadı.', 'DEPARTMENT_NOT_FOUND');
}

async function ensureSubdepartmentExists(id: string) {
  const subdepartment = await prisma.subdepartment.findUnique({ where: { id }, select: { id: true } });
  if (!subdepartment) throw Errors.notFound('Departament tapılmadı.', 'SUBDEPARTMENT_NOT_FOUND');
}

async function uniqueSlug(scope: 'department' | 'subdepartment' | 'position', name: string): Promise<string> {
  const base = slugify(name);
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const exists = scope === 'department'
      ? await prisma.department.findUnique({ where: { slug }, select: { id: true } })
      : scope === 'subdepartment'
        ? await prisma.subdepartment.findUnique({ where: { slug }, select: { id: true } })
        : await prisma.position.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${Date.now()}`;
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'taxonomy';
}

function mapTaxonomyWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return Errors.conflict('Bu taksonomiya qeydi artıq mövcuddur.', 'TAXONOMY_DUPLICATE');
    }
    if (error.code === 'P2025') {
      return Errors.notFound('Taksonomiya qeydi tapılmadı.', 'TAXONOMY_NOT_FOUND');
    }
  }
  return error;
}
