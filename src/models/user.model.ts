import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
fullname: string;
email: string;
phone: string;
password: string;
emailVerified: boolean;
role: 'admin' | 'client';
}

const userSchema: Schema<IUser> = new Schema(
    {
        fullname: {
            type: String,
            required: [true, 'Fullname is required'],
            trim: true,
            minlength: [2, 'Fullname must be at least 2 characters'],
            maxlength: [50, 'Fullname must be at most 50 characters'],
        },

        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
        },

        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            unique: true,
            trim: true,
            match: [/^\+?[1-9]\d{1,14}$/, 'Please fill a valid phone number'],
        },

        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
        },

        emailVerified: {
            type: Boolean,
            default: false,
        },

        role: {
            type: String,
            enum: {
                values: ['client', 'admin'],
                message: 'Role must be either client or admin',
            },
            default: 'client',
        },
    }
);

userSchema.index({ fullName: 1 });
userSchema.index({ email: 1 });
userSchema.index({ emailVerified: 1 });
userSchema.index({ role: 1 });
userSchema.index({ phone: 1 });


const User = mongoose.model<IUser>('User', userSchema);

export default User;