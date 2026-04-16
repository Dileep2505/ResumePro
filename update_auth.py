#!/usr/bin/env python
"""Fix authentication: update user_api.py with bcrypt and error handling"""

# Read current file
with open('backend/api/user_api.py', 'r') as f:
    lines = f.readlines()

# Find and update the _hash_password function
output = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Replace hashlib import if present
    if 'import hashlib' in line:
        i += 1
        continue
    
    # Replace _hash_password function
    if 'def _hash_password(password: str)' in line:
        # Skip old function until we find the next def
        while i < len(lines) and not (lines[i].strip().startswith('def ') and 'hash_password' not in lines[i]):
            i += 1
        
        # Insert new function
        new_func = '''def _hash_password(password: str) -> str:
    """Hash password using bcrypt with salt"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash"""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


'''
        output.append(new_func)
        continue
    
    # Replace login_user to use _verify_password
    if 'def login_user(payload: UserLoginRequest' in line:
        output.append(line)
        i += 1
        # Skip until we find the password check
        while i < len(lines) and 'if not user or user.password_hash' not in lines[i]:
            output.append(lines[i])
            i += 1
        
        # Replace the password check
        if i < len(lines):
            output.append('        \n')
            output.append('        # Verify password using bcrypt\n')
            output.append('        if not _verify_password(payload.password, user.password_hash):\n')
            i += 1
            # Skip old check line
            while i < len(lines) and 'raise HTTPException(status_code=401' not in lines[i]:
                i += 1
            if i < len(lines):
                output.append(lines[i])  # The HTTPException line
                i += 1
        continue
    
    output.append(line)
    i += 1

# Write updated file
with open('backend/api/user_api.py', 'w') as f:
    f.writelines(output)

print("✓ Authentication updated with bcrypt!")
