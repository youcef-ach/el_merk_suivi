import { PrismaService } from '../prisma/prisma.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
export declare class EnterprisesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createEnterpriseDto: CreateEnterpriseDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
    }>;
    findAll(): Promise<{
        id: string;
        createdAt: Date;
        name: string;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
    }>;
    addMember(dto: AddMemberDto, callerEnterpriseId: string): Promise<{
        email: string;
        id: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
    }>;
    getMembers(enterpriseId: string): Promise<{
        email: string;
        id: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
    }[]>;
    removeMember(memberId: string, callerEnterpriseId: string, callerId: string): Promise<{
        email: string;
        password: string;
        enterpriseId: string | null;
        id: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
    }>;
}
