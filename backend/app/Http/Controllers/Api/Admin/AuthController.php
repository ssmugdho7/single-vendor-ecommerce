<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(LoginRequest $request): array
    {
        $user = User::where('email', $request->string('email'))->first();

        if (! $user || ! $user->is_admin || ! Hash::check($request->string('password'), $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        return [
            'user' => $user,
            'token' => $user->createToken('admin-token')->plainTextToken,
        ];
    }

    public function logout(Request $request): array
    {
        $request->user()->currentAccessToken()->delete();

        return ['message' => 'Logged out.'];
    }

    public function me(Request $request): User
    {
        return $request->user();
    }
}
