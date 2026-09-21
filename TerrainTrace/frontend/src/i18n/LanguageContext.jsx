import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try {
      const savedLanguage = localStorage.getItem('terraintrace-language');
      return savedLanguage || 'en';
    } catch (e) {
      console.error('Error reading language from localStorage:', e);
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('terraintrace-language', language);
    } catch (e) {
      console.error('Error saving language to localStorage:', e);
    }
  }, [language]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback((path, params = {}) => {
    if (!path) return '';
    
    const keys = path.split('.');
    let current = translations[language];

    // Try finding in current language
    for (let i = 0; i < keys.length; i++) {
      if (current === undefined || current === null) break;
      current = current[keys[i]];
    }

    // Fallback to English
    if (current === undefined) {
      let fallback = translations['en'];
      for (let i = 0; i < keys.length; i++) {
        if (fallback === undefined || fallback === null) break;
        fallback = fallback[keys[i]];
      }
      current = fallback;
    }

    // If still undefined, return the key path
    if (current === undefined) {
      return path;
    }

    // Handle string translation with interpolation
    if (typeof current === 'string') {
      let result = current;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return result;
    }

    // Return the raw value (e.g., array for lists)
    return current;
  }, [language]);

  const value = React.useMemo(() => ({
    language,
    setLanguage,
    t
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
