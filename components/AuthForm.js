import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box,
  Button,
  Input,
  FormControl,
  FormLabel,
  Text,
  Divider,
  IconButton,
  InputGroup,
  InputRightElement,
  Alert,
  AlertIcon,
  Checkbox,
  Link,
  VStack,
  HStack,
  Flex,
  Image,
} from '@chakra-ui/react';

// Custom Google Icon Component
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

// Custom Eye Icons
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
  </svg>
);

const providers = [
  { name: 'google', icon: <GoogleIcon /> },
];

export default function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    let result;
    if (isSignUp) {
      result = await supabase.auth.signUp({ email, password });
      if (result.error) {
        setError(result.error.message);
      } else {
        setSuccess('Check your email to confirm your account.');
      }
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(result.error.message);
      } else {
        setSuccess('Signed in successfully!');
      }
    }
    setLoading(false);
  };

  const handleSocial = async (provider) => {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <Flex
      minH="100vh"
      w="100vw"
      bg="white"
      align="flex-start"
      justify="center"
      pt={10}
    >
      <Box
        w={400}
        maxW="95vw"
        p={8}
        bg="rgba(255, 255, 255, 0.95)"
        backdropFilter="blur(20px)"
        border="1px solid rgba(255, 255, 255, 0.3)"
        borderRadius="20px"
        boxShadow="0 20px 60px rgba(0, 0, 0, 0.1)"
      >
        <VStack spacing={6} align="center">
          <Image src="../public/offerbase-logo.svg" alt="Offerbase Logo" h="27px" />

          <VStack spacing={2} textAlign="center">
            <Text fontSize="2xl" fontWeight="700" color="gray.900">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </Text>
            <Text color="gray.600" fontSize="md">
              Please enter yur details to {isSignUp ? 'sign up' : 'sign in'}
            </Text>
          </VStack>

          <HStack spacing={4}>
            {providers.map((p) => (
              <IconButton
                key={p.name}
                onClick={() => handleSocial(p.name)}
                isDisabled={loading}
                size="lg"
                variant="outline"
                borderColor="gray.200"
                bg="white"
                color="gray.700"
                _hover={{
                  bg: 'gray.50',
                  transform: 'translateY(-1px)',
                  boxShadow: 'md',
                }}
                transition="all 0.2s ease"
              >
                {p.icon}
              </IconButton>
            ))}
          </HStack>

          <Divider />
          <Text fontSize="sm" color="gray.500">or</Text>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {success && (
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              {success}
            </Alert>
          )}

          <Box as="form" onSubmit={handleSubmit} w="full">
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel color="gray.700">Your Email Address</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  bg="white"
                  borderColor="gray.200"
                  borderRadius="md"
                  _focus={{
                    borderColor: 'gray.900',
                    boxShadow: '0 0 0 1px gray.900',
                  }}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.700">Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    bg="white"
                    borderColor="gray.200"
                    borderRadius="md"
                    _focus={{
                      borderColor: 'gray.900',
                      boxShadow: '0 0 0 1px gray.900',
                    }}
                  />
                  <InputRightElement>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                      icon={showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      color="gray.500"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <Flex justify="space-between" align="center" w="full">
                <Checkbox
                  isChecked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  colorScheme="gray"
                >
                  <Text fontSize="sm" color="gray.700">Remember me</Text>
                </Checkbox>
                <Link href="#" fontSize="sm" color="gray.700" _hover={{ color: 'gray.900' }}>
                  Forgot password?
                </Link>
              </Flex>

              <Button
                type="submit"
                w="full"
                bg="gray.900"
                color="white"
                size="lg"
                borderRadius="md"
                fontWeight="600"
                isLoading={loading}
                loadingText={isSignUp ? 'Signing up...' : 'Signing in...'}
                _hover={{
                  bg: 'gray.800',
                  transform: 'translateY(-1px)',
                  boxShadow: 'lg',
                }}
                transition="all 0.2s ease"
              >
                {isSignUp ? 'Sign up' : 'Sign in'}
              </Button>
            </VStack>
          </Box>

          <Text color="gray.700">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              fontWeight="600"
              color="gray.900"
              _hover={{ textDecoration: 'underline' }}
              cursor="pointer"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </Link>
          </Text>
        </VStack>
      </Box>
    </Flex>
  );
} 