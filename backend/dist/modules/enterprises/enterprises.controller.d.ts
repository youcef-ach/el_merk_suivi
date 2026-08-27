import { EnterprisesService } from './enterprises.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
export declare class EnterprisesController {
    private readonly enterprisesService;
    constructor(enterprisesService: EnterprisesService);
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
    getMembers(user: any): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
    }[]>;
    addMember(dto: AddMemberDto, user: any): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
    }>;
    removeMember(memberId: string, user: any): Promise<{
        id: string;
        email: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
        enterpriseId: string | null;
        createdAt: Date;
    }>;
}
