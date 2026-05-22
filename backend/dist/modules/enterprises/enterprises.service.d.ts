import { PrismaService } from '../prisma/prisma.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
export declare class EnterprisesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createEnterpriseDto: CreateEnterpriseDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
    }>;
    findAll(): Promise<{
        id: string;
        name: string;
        createdAt: Date;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
    }>;
    addMember(dto: AddMemberDto, callerEnterpriseId: string): Promise<{
        email: string;
        id: string;
        createdAt: Date;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getMembers(enterpriseId: string): Promise<{
        email: string;
        id: string;
        createdAt: Date;
        role: import(".prisma/client").$Enums.Role;
    }[]>;
    removeMember(memberId: string, callerEnterpriseId: string, callerId: string): Promise<{
        email: string;
        password: string;
        enterpriseId: string | null;
        id: string;
        createdAt: Date;
        role: import(".prisma/client").$Enums.Role;
    }>;
}
