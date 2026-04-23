import globals from 'globals';

export default [
    {
        files: ['client/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.browser,
                ...globals.node,
                d3: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            semi: 'warn',
            'no-console': 'off'
        }
    },
    {
        files: ['server.js', 'server/*.js', 'shared/*.js', 'test/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            semi: 'warn',
            'no-console': 'off'
        }
    }
];

