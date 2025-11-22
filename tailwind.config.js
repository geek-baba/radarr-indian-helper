/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#2563EB',
          surface: '#FFFFFF',
          surfaceDark: '#0F172A',
          muted: '#F3F4F6',
          border: '#E5E7EB',
          success: '#16A34A',
          warning: '#D97706',
          danger: '#DC2626',
          info: '#0891B2'
        }
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.08)',
        header: '0 2px 8px rgba(0,0,0,0.06)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      }
    }
  },
  plugins: []
}

