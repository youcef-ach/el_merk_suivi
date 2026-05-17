import { Role } from '@prisma/client';
export declare class AddMemberDto {
    email: string;
    password: string;
    role: Role;
}
