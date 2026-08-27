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
        id: string;
        createdAt: Date;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getMembers(enterpriseId: string): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }[]>;
    removeMember(memberId: string, callerEnterpriseId: string, callerId: string): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
        enterpriseId: string | null;
    }>;
}
