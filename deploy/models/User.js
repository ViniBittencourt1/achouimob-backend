
// Model de usuário (apenas estrutura, sem Mongoose)
// Se precisar persistir, use Firestore ou outro serviço já integrado

export const User = {
  name: '',
  email: '',
  password: '',
  cardLast4: '',
  cardBrand: '',
  cardExpMonth: 0,
  cardExpYear: 0,
  // outros campos...
};
