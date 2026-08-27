import { EnterprisesService } from './enterprises.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
export declare class EnterprisesController {
    private readonly enterprisesService;
    constructor(enterprisesService: EnterprisesService);
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
    getMembers(user: any): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }[]>;
    addMember(dto: AddMemberDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    removeMember(memberId: string, user: any): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
        enterpriseId: string | null;
    }>;
}
